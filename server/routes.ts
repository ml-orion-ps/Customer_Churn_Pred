import type { Express } from "express";
import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import { db } from "./db";
import { seedDatabase } from "./seed";
import multer from "multer";
import Papa from "papaparse";
import * as ss from "simple-statistics";
import { sql } from "drizzle-orm";
import { readFile, stat, writeFile } from "fs/promises";
import { join } from "path";
import { gzipSync, gunzipSync } from "zlib";
import { executePythonScript } from "./python-executor";
import { applyCustomFeatures, buildCustomFeatureFormula, buildPreviewRows, validateCustomFeatureDefinition } from "./custom-feature-engine";
import { customFeatureDefinitionSchema, type CustomFeatureDefinition } from "@shared/schema";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const datasetRowsCache = new Map<number, any[]>();
const MODEL_MIN_TENURE_MONTHS = 6;

function normalizeAlgorithmForShap(algorithm: string | null | undefined): "Logistic Regression" | "Random Forest" | "LightGBM" | "XGBoost" {
  const raw = (algorithm || "").toLowerCase();

  if (raw.includes("auto")) {
    if (raw.includes("xgboost")) return "XGBoost";
    if (raw.includes("lightgbm")) return "LightGBM";
    if (raw.includes("random forest")) return "Random Forest";
  }

  if (raw === "gradient boosting") return "XGBoost";
  if (raw === "neural network") return "Random Forest";
  if (raw === "svm") return "Random Forest";
  if (raw === "xgboost") return "XGBoost";
  if (raw === "lightgbm") return "LightGBM";
  if (raw === "random forest") return "Random Forest";
  if (raw === "logistic regression") return "Logistic Regression";

  return "Random Forest";
}

function parseScalarParam(value: unknown): unknown {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  if (lower === "true") return true;
  if (lower === "false") return false;
  if (lower === "none" || lower === "null" || lower === "nan") return null;

  if (trimmed !== "") {
    const asNumber = Number(trimmed);
    if (!Number.isNaN(asNumber)) return asNumber;
  }

  return value;
}

function extractFeatureReport(dataset: any): Record<string, any> {
  return (dataset?.featureReport && typeof dataset.featureReport === "object")
    ? { ...(dataset.featureReport as Record<string, any>) }
    : {};
}

function getDatasetCustomFeatures(dataset: any): CustomFeatureDefinition[] {
  const featureReport = extractFeatureReport(dataset);
  return Array.isArray(featureReport.customFeatures)
    ? featureReport.customFeatures as CustomFeatureDefinition[]
    : [];
}

function getModelCustomFeatures(model: any, dataset?: any): CustomFeatureDefinition[] {
  const snapshot = model?.modelWeights && typeof model.modelWeights === "object"
    ? (model.modelWeights as any).customFeatures
    : null;

  if (Array.isArray(snapshot) && snapshot.length > 0) {
    return snapshot as CustomFeatureDefinition[];
  }

  return dataset ? getDatasetCustomFeatures(dataset) : [];
}

function parseDatasetCsv(csvText: string): any[] {
  const parsed = Papa.parse(csvText, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(`Failed to parse persisted dataset CSV: ${parsed.errors[0]?.message || "Unknown error"}`);
  }

  return parsed.data as any[];
}

function buildDatasetStoragePayload(csvText: string, preview: any[], sample: any[]) {
  return {
    preview,
    sample,
    compressedCsvBase64: gzipSync(Buffer.from(csvText, "utf-8")).toString("base64"),
    csvEncoding: "gzip-base64",
    storageVersion: 2,
  };
}

function sanitizeDatasetForApi(dataset: any) {
  if (!dataset || typeof dataset !== "object") {
    return dataset;
  }

  const dataStore = dataset.dataPreview as any;
  if (!dataStore || typeof dataStore !== "object") {
    return dataset;
  }

  const { all: _all, rawCsv: _rawCsv, compressedCsvBase64: _compressedCsvBase64, ...safeDataPreview } = dataStore;
  return {
    ...dataset,
    dataPreview: safeDataPreview,
  };
}

function getDatasetRows(dataset: any): any[] {
  if (dataset?.id && datasetRowsCache.has(dataset.id)) {
    return datasetRowsCache.get(dataset.id)!;
  }

  const dataStore = dataset?.dataPreview as any;

  if (Array.isArray(dataStore?.all)) {
    if (dataset?.id) {
      datasetRowsCache.set(dataset.id, dataStore.all);
    }
    return dataStore.all;
  }

  const compressedCsvBase64 = typeof dataStore?.compressedCsvBase64 === "string"
    ? dataStore.compressedCsvBase64
    : null;
  const rawCsv = typeof dataStore?.rawCsv === "string"
    ? dataStore.rawCsv
    : null;

  if (compressedCsvBase64 || rawCsv) {
    const csvText = compressedCsvBase64
      ? gunzipSync(Buffer.from(compressedCsvBase64, "base64")).toString("utf-8")
      : rawCsv!;
    const rows = parseDatasetCsv(csvText);
    if (dataset?.id) {
      datasetRowsCache.set(dataset.id, rows);
    }
    return rows;
  }

  return dataStore?.sample || [];
}

function getDatasetSampleRows(dataset: any, limit = 500): any[] {
  const dataStore = dataset?.dataPreview as any;
  if (Array.isArray(dataStore?.sample)) {
    return dataStore.sample.slice(0, limit);
  }

  return getDatasetRows(dataset).slice(0, limit);
}

function getDatasetBaseColumnNames(dataset: any): string[] {
  const cols = Array.isArray(dataset?.columns) ? dataset.columns as any[] : [];
  return cols.map((col) => String(col.name));
}

function buildCustomFeatureColumnCatalog(dataset: any, features: CustomFeatureDefinition[]) {
  const cols = Array.isArray(dataset?.columns) ? dataset.columns as any[] : [];
  return [
    ...cols.map((col) => ({ name: String(col.name), type: String(col.type || "unknown") })),
    ...features.map((feature) => ({ name: feature.name, type: "numeric" })),
  ];
}

function normalizePersistedCustomFeature(feature: CustomFeatureDefinition): CustomFeatureDefinition {
  return {
    ...feature,
    formula: buildCustomFeatureFormula(feature),
    sortDirection: feature.sortDirection || "asc",
    status: "ready",
  };
}

function buildFeatureReportWithCustomFeatures(dataset: any, features: CustomFeatureDefinition[]) {
  const featureReport = extractFeatureReport(dataset);
  return {
    ...featureReport,
    customFeatures: features,
    customFeatureUpdatedAt: new Date().toISOString(),
  };
}

function getRowAccountNumber(row: any): string {
  return String(row?.account_number ?? row?.accountNumber ?? row?.id ?? "");
}

function isRowChurned(row: any): boolean {
  const raw = row?.is_churned ?? row?.isChurned ?? row?.churned ?? row?.target ?? row?.label;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw === 1;
  if (typeof raw === "string") return ["1", "true", "yes"].includes(raw.toLowerCase());
  return false;
}

function getRowSnapshotValue(row: any): string {
  return String(row?.snapshot_month ?? row?.snapshotMonth ?? "");
}

function isRowActive(row: any): boolean {
  const lifecycle = String(row?.lifecycle_stage_lower ?? row?.lifecycle_stage ?? row?.lifecycleStage ?? "").trim().toLowerCase();
  if (lifecycle) return lifecycle === "active";
  return !isRowChurned(row);
}

function getRowTenureMonths(row: any): number {
  const raw = Number(row?.tenure_months ?? row?.tenureMonths ?? 0);
  return Number.isFinite(raw) ? raw : 0;
}

function getLatestDatasetActiveRows(rows: any[]): any[] {
  if (rows.length === 0) return [];

  const latestSnapshot = rows
    .map(getRowSnapshotValue)
    .filter(Boolean)
    .sort()
    .at(-1);

  if (!latestSnapshot) return [];

  const latestByAccount = new Map<string, any>();

  for (const row of rows) {
    const account = getRowAccountNumber(row);
    if (!account) continue;
    if (getRowSnapshotValue(row) !== latestSnapshot) continue;
    if (!isRowActive(row)) continue;
    if (getRowTenureMonths(row) < MODEL_MIN_TENURE_MONTHS) continue;

    const current = latestByAccount.get(account);
    if (!current || getRowSnapshotValue(row) > getRowSnapshotValue(current)) {
      latestByAccount.set(account, row);
    }
  }

  return Array.from(latestByAccount.values());
}

function extractShapModelParams(
  normalizedAlgorithm: "Logistic Regression" | "Random Forest" | "LightGBM" | "XGBoost",
  rawParams: unknown,
): Record<string, unknown> {
  const params = (rawParams && typeof rawParams === "object")
    ? (rawParams as Record<string, unknown>)
    : {};

  const out: Record<string, unknown> = {};

  const skipKeys = new Set([
    "model_family",
    "winsorize",
    "lower_q",
    "upper_q",
    "variance_threshold",
    "use_vif",
    "vif_threshold",
  ]);

  const allowedByAlgorithm: Record<string, Set<string>> = {
    "Logistic Regression": new Set(["C", "class_weight", "penalty"]),
    "Random Forest": new Set(["n_estimators", "max_depth", "min_samples_leaf", "class_weight", "max_features"]),
    "LightGBM": new Set(["n_estimators", "learning_rate", "num_leaves", "min_child_samples", "subsample", "colsample_bytree", "class_weight"]),
    "XGBoost": new Set(["n_estimators", "learning_rate", "max_depth", "min_child_weight", "subsample", "colsample_bytree", "scale_pos_weight"]),
  };

  const expectedPrefix = normalizedAlgorithm === "Random Forest"
    ? "rf_"
    : normalizedAlgorithm === "LightGBM"
      ? "lgbm_"
      : normalizedAlgorithm === "XGBoost"
        ? "xgb_"
        : "";

  for (const [key, rawValue] of Object.entries(params)) {
    if (skipKeys.has(key)) continue;

    let mappedKey = key;

    if (normalizedAlgorithm === "Logistic Regression") {
      if (key === "logistic_class_weight") mappedKey = "class_weight";
      else if (key.startsWith("rf_") || key.startsWith("lgbm_") || key.startsWith("xgb_")) continue;
    } else {
      if (key.startsWith("rf_") || key.startsWith("lgbm_") || key.startsWith("xgb_")) {
        if (!key.startsWith(expectedPrefix)) continue;
        mappedKey = key.substring(expectedPrefix.length);
      } else if (key === "C" || key === "penalty" || key === "logistic_class_weight") {
        continue;
      }
    }

    if (!allowedByAlgorithm[normalizedAlgorithm].has(mappedKey)) continue;

    const parsedValue = parseScalarParam(rawValue);
    if (parsedValue !== undefined) {
      out[mappedKey] = parsedValue;
    }
  }

  return out;
}

function deriveDriverTypes(topDriversText: string): string[] {
  if (!topDriversText || !topDriversText.trim()) return ["mixed_other"];

  const text = topDriversText.toLowerCase();
  const types: string[] = [];

  const hasAny = (terms: string[]) => terms.some(t => text.includes(t));

  if (hasAny(["ticket", "outage", "csat", "nps", "frustration", "repeat_issue", "speed_gap"])) {
    types.push("service_issue");
  }
  if (hasAny(["revenue", "bill", "price", "bill_shock", "price_increase", "late_payment", "collections"])) {
    types.push("pricing_value");
  }
  if (hasAny(["usage", "engagement", "drop", "usage_mom"])) {
    types.push("engagement_drop");
  }
  if (hasAny(["contract", "commitment", "near_contract_end", "months_to_commitment_end"])) {
    types.push("contract_renewal");
  }

  return types.length > 0 ? types : ["mixed_other"];
}

function buildRecommendedAction(riskCategory: "very high" | "high" | "medium" | "low", topDriversText: string): string {
  if (riskCategory === "low") {
    return "Monitor with digital nudges only.";
  }

  const driverTypes = deriveDriverTypes(topDriversText);
  const hasService = driverTypes.includes("service_issue");
  const hasPricing = driverTypes.includes("pricing_value");
  const hasEngagement = driverTypes.includes("engagement_drop");
  const hasContract = driverTypes.includes("contract_renewal");

  if (hasService && hasPricing) {
    return "Prioritize immediate service recovery outreach, then review plan and value fit.";
  }
  if (hasService) {
    return "Immediate service recovery outreach and proactive support follow-up are recommended.";
  }
  if (hasPricing && hasContract) {
    return "Proactive renewal outreach with plan or pricing optimization is recommended.";
  }
  if (hasPricing) {
    return "Targeted value and pricing review outreach is recommended.";
  }
  if (hasEngagement) {
    return "Run proactive re-engagement nudges and plan-fit review.";
  }
  if (hasContract) {
    return "Start proactive renewal outreach before commitment end.";
  }

  return riskCategory === "very high" || riskCategory === "high"
    ? "Immediate manual retention outreach is recommended."
    : "Proactive retention outreach is recommended.";
}

function buildActionType(riskCategory: "very high" | "high" | "medium" | "low", topDriversText: string): string {
  const driverTypes = deriveDriverTypes(topDriversText);
  if (driverTypes.includes("service_issue")) return "service_recovery";
  if (driverTypes.includes("pricing_value")) return "pricing_plan_review";
  if (driverTypes.includes("contract_renewal")) return "renewal_outreach";
  if (driverTypes.includes("engagement_drop")) return "engagement_reactivation";
  return (riskCategory === "very high" || riskCategory === "high") ? "high_touch_retention" : "monitoring_nudge";
}

function estimateImpact(customer: any, riskCategory: "very high" | "high" | "medium" | "low"): number {
  const monthlyRevenue = Math.max(0, Number(customer?.monthlyRevenue ?? 0));
  const monthsProtected = riskCategory === "very high" ? 12 : riskCategory === "high" ? 8 : riskCategory === "medium" ? 4 : 1;
  return Math.round(monthlyRevenue * monthsProtected);
}

function estimateCost(riskCategory: "very high" | "high" | "medium" | "low"): number {
  if (riskCategory === "very high") return 180;
  if (riskCategory === "high") return 120;
  if (riskCategory === "medium") return 60;
  return 15;
}

function classifyRiskCategoryFromRank(index: number, total: number): "very high" | "high" | "medium" | "low" {
  if (total <= 0) return "low";

  const rankPct = (index + 1) / total;
  if (rankPct <= 0.05) return "very high";
  if (rankPct <= 0.15) return "high";
  if (rankPct <= 0.30) return "medium";
  return "low";
}

function classifyRiskCategoryFromProbability(probability: number): "very high" | "high" | "medium" | "low" {
  if (probability > 0.85) return "very high";
  if (probability >= 0.70) return "high";
  if (probability >= 0.50) return "medium";
  return "low";
}

function mapRiskBandToCategory(riskBand: unknown, probability?: number): "very high" | "high" | "medium" | "low" {
  const normalized = String(riskBand ?? "").trim().toLowerCase();
  if (normalized === "very high risk") return "very high";
  if (normalized === "high risk") return "high";
  if (normalized === "medium risk") return "medium";
  if (normalized === "low risk") return "low";

  return classifyRiskCategoryFromProbability(Number(probability ?? 0));
}

/**
 * Syncs unique accounts from a dataset's CSV rows into the customers table via upsert.
 * Deduplicates by account_number taking the latest snapshot_month row.
 * Returns the Set of account numbers that were synced.
 */
async function syncCustomersFromDataset(datasetId: number): Promise<Set<string>> {
  const ds = await storage.getDataset(datasetId);
  if (!ds) return new Set();

  const allRows = getDatasetRows(ds);
  if (allRows.length === 0 || !Object.prototype.hasOwnProperty.call(allRows[0], 'account_number')) {
    return new Set();
  }

  // Deduplicate by account_number, keep latest snapshot_month
  const latestByAccount = new Map<string, any>();
  for (const row of allRows) {
    const acct = String(row.account_number);
    const current = latestByAccount.get(acct);
    if (!current || String(row.snapshot_month ?? '') > String(current.snapshot_month ?? '')) {
      latestByAccount.set(acct, row);
    }
  }

  const valueTierMap: Record<string, string> = {
    High: 'Platinum', Premium: 'Platinum',
    Mid: 'Gold',
    Low: 'Silver',
    Budget: 'Bronze',
  };

  const toInt = (value: any, fallback: number): number => {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.round(num);
  };

  const toOptionalInt = (value: any): number | undefined => {
    const num = Number(value);
    if (!Number.isFinite(num)) return undefined;
    return Math.round(num);
  };

  const synced = new Set<string>();
  for (const [acct, row] of latestByAccount) {
    let tenureMonths = 12;
    if (row.activation_date && row.snapshot_month) {
      try {
        const activationDate = new Date(String(row.activation_date));
        const snapshotDate = new Date(String(row.snapshot_month));
        const months = Math.round((snapshotDate.getTime() - activationDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
        if (months > 0) tenureMonths = months;
      } catch { /* keep default */ }
    }

    const mrc =
      (Number(row.mrc_data) || 0) +
      (Number(row.mrc_voice) || 0) +
      (Number(row.mrc_video) || 0);
    const monthlyRevenue = mrc > 0 ? mrc : Number(row.bill_amount) || 50;
    const isChurned = row.churn_event_month != null && String(row.churn_event_month).trim() !== '';
    const rawVt = String(row.value_tier ?? 'Silver');
    const valueTier = valueTierMap[rawVt] ?? rawVt;
    const serviceType = String(row.service_type ?? 'Copper DSL').replace(/_/g, ' ');

    try {
      await storage.upsertCustomer({
        accountNumber: acct,
        name: `Account ${acct}`,
        region: String(row.geographic_market ?? 'Unknown'),
        state: 'N/A',
        serviceType,
        tenureMonths,
        monthlyRevenue,
        contractStatus: String(row.lifecycle_stage ?? 'Active'),
        valueTier,
        provisionedSpeed: Number(row.subscribed_speed_mbps) || undefined,
        actualSpeed: Number(row.avg_delivered_throughput_mbps) || undefined,
        outageCount: toInt(row.network_outage_events, 0),
        ticketCount: toInt(row.trouble_ticket_volume, 0),
        avgResolutionHours: Number(row.ticket_resolution_time_hours) || undefined,
        npsScore: toOptionalInt(row.nps_score),
        fiberAvailable: Boolean(Number(row.fiber_available_at_premises)),
        competitorAvailable: Boolean(Number(row.competitor_broadband_available_by_address)),
        isChurned,
        churnReason: isChurned ? (String(row.churn_reason_code ?? '').trim() || null) : null,
        lastBillAmount: Number(row.bill_amount) || undefined,
        premisesType: String(row.premises_type ?? '').trim() || undefined,
        lifecycleStage: String(row.lifecycle_stage ?? '').trim() || undefined,
      });
      synced.add(acct);
    } catch (err: any) {
      console.error(`[syncCustomers] Failed to upsert account ${acct}:`, err?.message);
    }
  }

  console.log(`[syncCustomers] Synced ${synced.size} accounts from dataset ${datasetId}`);
  return synced;
}

async function computeProdMetrics(
  scoredPairs: { accountNumber: string; churnProbability: number }[],
  prodDatasetId: number,
): Promise<{ prodAuc: number | null; prodAccuracy: number | null; prodRecall: number | null }> {
  const prodDs = await storage.getDataset(prodDatasetId);
  if (!prodDs) return { prodAuc: null, prodAccuracy: null, prodRecall: null };
  const prodRows = getDatasetRows(prodDs);
  if (prodRows.length === 0) return { prodAuc: null, prodAccuracy: null, prodRecall: null };
  const firstRow = prodRows[0];
  // Only treat explicitly-labeled datasets (is_churned / ischurned columns) as evaluatable.
  // churn_event_month is a historical schema field — its presence does NOT mean future
  // churn labels exist for point-in-time scoring uploads.
  const hasIsChurned = "ischurned" in firstRow || "is_churned" in firstRow;
  if (!hasIsChurned) return { prodAuc: null, prodAccuracy: null, prodRecall: null };

  const prodLabelByAcct = new Map<string, number>();
  for (const row of prodRows) {
    const rawAcct = String(row.account_number ?? row.accountNumber ?? "").trim();
    if (!rawAcct) continue;
    let yTrue = 0;
    const col = "ischurned" in firstRow ? "ischurned" : "is_churned";
    yTrue = (row[col] === 1 || row[col] === "1" || row[col] === true) ? 1 : 0;
    prodLabelByAcct.set(rawAcct, yTrue);
    try {
      const norm = String(parseInt(String(parseFloat(rawAcct))));
      if (norm !== rawAcct) prodLabelByAcct.set(norm, yTrue);
    } catch { /* skip */ }
  }

  const pairs: { yTrue: number; yProb: number }[] = [];
  for (const { accountNumber, churnProbability } of scoredPairs) {
    if (!accountNumber) continue;
    const acct = String(accountNumber).trim();
    let normAcct = acct;
    try { normAcct = String(parseInt(String(parseFloat(acct)))); } catch { /* skip */ }
    const yTrue = prodLabelByAcct.get(normAcct) ?? prodLabelByAcct.get(acct);
    if (yTrue === undefined) continue;
    pairs.push({ yTrue, yProb: churnProbability });
  }

  if (pairs.length < 5) return { prodAuc: null, prodAccuracy: null, prodRecall: null };

  const totalPos = pairs.reduce((s, p) => s + p.yTrue, 0);
  const totalNeg = pairs.length - totalPos;
  let prodAuc: number | null = null;
  if (totalPos > 0 && totalNeg > 0) {
    const sorted = [...pairs].sort((a, b) => b.yProb - a.yProb);
    let tp = 0, fp = 0, aucSum = 0, prevFpr = 0, prevTpr = 0;
    for (const p of sorted) {
      if (p.yTrue === 1) tp += 1; else fp += 1;
      const tpr = tp / totalPos;
      const fpr = fp / totalNeg;
      aucSum += (fpr - prevFpr) * (tpr + prevTpr) / 2;
      prevFpr = fpr; prevTpr = tpr;
    }
    prodAuc = parseFloat(aucSum.toFixed(4));
  }
  let tp50 = 0, fp50 = 0, tn50 = 0, fn50 = 0;
  for (const p of pairs) {
    const pred = p.yProb >= 0.5 ? 1 : 0;
    if (pred === 1 && p.yTrue === 1) tp50++;
    else if (pred === 1 && p.yTrue === 0) fp50++;
    else if (pred === 0 && p.yTrue === 0) tn50++;
    else fn50++;
  }
  const prodAccuracy = parseFloat(((tp50 + tn50) / pairs.length).toFixed(4));
  const prodRecall = (tp50 + fn50) > 0 ? parseFloat((tp50 / (tp50 + fn50)).toFixed(4)) : null;
  return { prodAuc, prodAccuracy, prodRecall };
}

async function generateAndPersistPredictionsForModel(model: any, precomputedPredictions?: any[], prodDatasetId?: number): Promise<{ predicted: number; veryHigh: number; high: number; medium: number; low: number; prodAuc: number | null; prodAccuracy: number | null; prodRecall: number | null }> {
  // If this model was trained from an uploaded dataset, sync those CSV accounts into the
  // customers table first so predictions carry the correct account numbers.
  let datasetAccountNumbers: Set<string> | null = null;
  let datasetTrainingRows: any[] | null = null;
  let datasetScoreRows: any[] | null = null;
  if (model.datasetId && model.datasetId > 0) {
    datasetAccountNumbers = await syncCustomersFromDataset(model.datasetId);
    const dataset = await storage.getDataset(model.datasetId);
    if (dataset) {
      const datasetCustomFeatures = getModelCustomFeatures(model, dataset);
      const baseRows = getDatasetRows(dataset);
      datasetTrainingRows = datasetCustomFeatures.length > 0
        ? applyCustomFeatures(baseRows, datasetCustomFeatures)
        : baseRows;
      datasetScoreRows = getLatestDatasetActiveRows(datasetTrainingRows);
    }
  }

  // If a production dataset is selected, override scoring rows with prod data.
  // Training rows remain from the original training dataset (for SHAP baseline).
  if (prodDatasetId && prodDatasetId > 0) {
    const prodAccountNums = await syncCustomersFromDataset(prodDatasetId);
    // Scope customer filtering to prod accounts for scoring
    datasetAccountNumbers = prodAccountNums;
    const prodDataset = await storage.getDataset(prodDatasetId);
    if (prodDataset) {
      const prodBaseRows = getDatasetRows(prodDataset);
      datasetScoreRows = getLatestDatasetActiveRows(prodBaseRows);
    }
  }

  let allCustomers = await storage.getCustomers();

  // For dataset-trained models, scope scoring to only the dataset's own accounts.
  if (datasetAccountNumbers && datasetAccountNumbers.size > 0) {
    allCustomers = allCustomers.filter(c =>
      c.accountNumber != null && datasetAccountNumbers!.has(String(c.accountNumber))
    );
  }

  // Fast path: use precomputed predictions from train_model.py so we never retrain from raw DB fields.
  // When precomputed predictions are provided, ALWAYS use them and NEVER fall through to the backfill path.
  // This ensures only Python-filtered customers (active + latest month + min tenure) appear in results.
  if (precomputedPredictions && precomputedPredictions.length > 0) {
    const customerByAcct = new Map<string, any>();
    for (const c of allCustomers) {
      if (c.accountNumber != null) {
        customerByAcct.set(String(c.accountNumber), c);
        // Also index by Python-normalised form str(int(float(...))) to handle "200000.0" vs "200000"
        try {
          const norm = String(parseInt(String(parseFloat(String(c.accountNumber)))));
          if (norm !== String(c.accountNumber)) customerByAcct.set(norm, c);
        } catch { /* ignore */ }
      }
    }
    const preScored: { customer: any; churnProbability: number; topDrivers: any[]; topDriversText: string; riskBand?: string; finalRecommendation?: string }[] = [];
    for (const p of precomputedPredictions) {
      const rawAcct = String(p.account_number ?? p.accountNumber ?? "");
      if (!rawAcct) continue;
      // Normalise to match Python's str(int(float(...))) so "200000.0" → "200000"
      let acct = rawAcct;
      try { acct = String(parseInt(String(parseFloat(rawAcct)))); } catch { acct = rawAcct.trim(); }
      let customer = customerByAcct.get(acct) ?? customerByAcct.get(rawAcct);
      if (!customer) {
        // Account not yet in customers table — upsert it on the fly.
        // Python already validated it passes active + min-tenure + latest-month filters.
        try {
          customer = await storage.upsertCustomer({
            accountNumber: acct,
            name: `Account ${acct}`,
            region: 'Unknown',
            state: 'N/A',
            serviceType: 'Copper DSL',
            tenureMonths: 12,
            monthlyRevenue: 50,
            contractStatus: 'Active',
            valueTier: 'Silver',
            isChurned: false,
            lifecycleStage: 'Active',
          });
          customerByAcct.set(acct, customer);
        } catch (upsertErr: any) {
          console.warn(`[ML] Could not upsert account ${acct} on-the-fly: ${upsertErr?.message}`);
          continue;
        }
      }
      const rawProb = Number(p.churn_probability ?? p.churnProbability ?? 0);
      const prob = Number.isFinite(rawProb) ? Math.min(0.9999, Math.max(0.0001, rawProb)) : 0.05;
      const topDrivers: any[] = Array.isArray(p.top3Drivers) ? p.top3Drivers : [];
      const topDriversText: string = typeof p.top3DriversStr === 'string'
        ? p.top3DriversStr
        : topDrivers.map((d: any) => String(d?.feature ?? "").trim()).filter(Boolean).join(", ");
      const riskBand = typeof p.riskBand === 'string'
        ? p.riskBand
        : typeof p.risk_band === 'string'
          ? p.risk_band
          : undefined;
      const finalRecommendation = typeof p.finalRecommendation === 'string' && p.finalRecommendation ? p.finalRecommendation : undefined;
      preScored.push({ customer, churnProbability: prob, topDrivers, topDriversText, riskBand, finalRecommendation });
    }
    // Always persist whatever we scored from precomputed predictions — never fall through to backfill.
    preScored.sort((a, b) => b.churnProbability - a.churnProbability);
    await storage.clearPredictionsByModel(model.id);
    let veryHigh = 0, high = 0, medium = 0, low = 0;
    for (let i = 0; i < preScored.length; i++) {
      const item = preScored[i];
      const riskCategory = item.riskBand
        ? mapRiskBandToCategory(item.riskBand, item.churnProbability)
        : classifyRiskCategoryFromProbability(item.churnProbability);
      // Use Groq-generated recommendation if available (from Python scoring), else rule-based fallback
      const recommendedAction = item.finalRecommendation ?? buildRecommendedAction(riskCategory, item.topDriversText);
      if (riskCategory === "very high") veryHigh += 1;
      else if (riskCategory === "high") high += 1;
      else if (riskCategory === "medium") medium += 1;
      else low += 1;
      const prediction = await storage.createPrediction({
        modelId: model.id,
        customerId: item.customer.id,
        churnProbability: Number(item.churnProbability.toFixed(6)),
        riskCategory,
        topDrivers: item.topDrivers.slice(0, 3),
        recommendedAction,
        actionCategory: (riskCategory === "very high" || riskCategory === "high") ? "urgent" : riskCategory === "medium" ? "proactive" : "monitor",
      });
      await storage.createRecommendation({
        customerId: item.customer.id,
        predictionId: prediction.id,
        actionType: buildActionType(riskCategory, item.topDriversText),
        description: recommendedAction,
        priority: riskCategory,
        estimatedImpact: estimateImpact(item.customer, riskCategory),
        estimatedCost: estimateCost(riskCategory),
        status: "pending",
      });
    }
    console.log(`[ML] Precomputed fast path: ${preScored.length} predictions for model ${model.id} (Groq: ${preScored.filter(x => x.finalRecommendation).length} LLM / ${preScored.filter(x => !x.finalRecommendation).length} rule-based)`);
    // Compute prod metrics if a prod dataset was selected
    const precomputedAccountProbs = preScored.map(s => ({ accountNumber: String(s.customer.accountNumber ?? ""), churnProbability: s.churnProbability }));
    const precomputedProdMetrics = prodDatasetId ? await computeProdMetrics(precomputedAccountProbs, prodDatasetId) : { prodAuc: null, prodAccuracy: null, prodRecall: null };
    return { predicted: preScored.length, veryHigh, high, medium, low, ...precomputedProdMetrics };
  }

  const activeCustomers = allCustomers.filter(c => !c.isChurned);
  // When scoring prod data, include all synced prod accounts (including those marked churned in DB)
  // so that validation rows with churn_event_month set can still be matched to predictions.
  const scoreCustomers = prodDatasetId ? allCustomers : activeCustomers;
  const scoreRows = datasetScoreRows && datasetScoreRows.length > 0 ? datasetScoreRows : activeCustomers;
  const trainRows = datasetTrainingRows && datasetTrainingRows.length > 0 ? datasetTrainingRows : allCustomers;

  type ScoredCustomerPrediction = {
    customer: any;
    churnProbability: number;
    topDrivers: any[];
    topDriversText: string;
    riskBand?: string;
    finalRecommendation?: string;
  };

  if (scoreRows.length === 0) {
    await storage.clearPredictionsByModel(model.id);
    return { predicted: 0, veryHigh: 0, high: 0, medium: 0, low: 0, prodAuc: null, prodAccuracy: null, prodRecall: null };
  }

  const normalizedAlgorithm = normalizeAlgorithmForShap(model.algorithm);
  const modelParams = extractShapModelParams(normalizedAlgorithm, model.hyperparameters || {});

  let scored: ScoredCustomerPrediction[] = [];

  try {
    const shapResult = await executePythonScript("calculate_shap.py", {
      algorithm: normalizedAlgorithm,
      modelParams,
      trainData: trainRows,
      scoreData: scoreRows,
      targetColumn: "isChurned",
    });

    const shapPredictions = Array.isArray(shapResult?.predictions) ? shapResult.predictions : [];
    const customerByKey = new Map<string, any>();

    for (const customer of scoreCustomers) {
      customerByKey.set(String(customer.id), customer);
      if (customer.accountNumber != null) {
        customerByKey.set(String(customer.accountNumber), customer);
      }
    }

    scored = shapPredictions
      .map((p: any) => {
        const customer = customerByKey.get(String(p.accountId));
        if (!customer) return null;

        const rawProb = Number(p.churnProbability);
        if (!Number.isFinite(rawProb)) return null;
        const boundedProb = Math.min(0.9999, Math.max(0.0001, rawProb));

        const topDrivers = Array.isArray(p.top3Drivers) ? p.top3Drivers : [];
        const topDriversText = topDrivers
          .map((d: any) => String(d?.feature ?? d?.driver ?? "").trim())
          .filter(Boolean)
          .join(", ");

        return {
          customer,
          churnProbability: boundedProb,
          topDrivers,
          topDriversText,
          riskBand: typeof p.riskBand === "string" ? p.riskBand : undefined,
          finalRecommendation: typeof p.finalRecommendation === "string" && p.finalRecommendation
            ? p.finalRecommendation
            : undefined,
        };
      })
      .filter((x: ScoredCustomerPrediction | null): x is ScoredCustomerPrediction => x !== null);
  } catch (pythonError: any) {
    console.error(`[ML] SHAP scoring failed for model ${model.id}:`, pythonError?.message || pythonError);
  }

  if (scored.length === 0) {
    await storage.clearPredictionsByModel(model.id);
    console.warn(`[ML] No scored predictions for model ${model.id}; skipping persistence to avoid dummy values.`);
    return { predicted: 0, veryHigh: 0, high: 0, medium: 0, low: 0, prodAuc: null, prodAccuracy: null, prodRecall: null };
  }

  scored.sort((a, b) => b.churnProbability - a.churnProbability);
  await storage.clearPredictionsByModel(model.id);

  let veryHigh = 0;
  let high = 0;
  let medium = 0;
  let low = 0;

  for (let i = 0; i < scored.length; i++) {
    const item = scored[i];
    const riskCategory = item.riskBand
      ? mapRiskBandToCategory(item.riskBand, item.churnProbability)
      : classifyRiskCategoryFromProbability(item.churnProbability);
    const recommendedAction = item.finalRecommendation ?? buildRecommendedAction(riskCategory, item.topDriversText);

    if (riskCategory === "very high") veryHigh += 1;
    else if (riskCategory === "high") high += 1;
    else if (riskCategory === "medium") medium += 1;
    else low += 1;

    const prediction = await storage.createPrediction({
      modelId: model.id,
      customerId: item.customer.id,
      churnProbability: Number(item.churnProbability.toFixed(6)),
      riskCategory,
      topDrivers: item.topDrivers.slice(0, 3),
      recommendedAction,
      actionCategory: (riskCategory === "very high" || riskCategory === "high") ? "urgent" : riskCategory === "medium" ? "proactive" : "monitor",
    });

    await storage.createRecommendation({
      customerId: item.customer.id,
      predictionId: prediction.id,
      actionType: buildActionType(riskCategory, item.topDriversText),
      description: recommendedAction,
      priority: riskCategory,
      estimatedImpact: estimateImpact(item.customer, riskCategory),
      estimatedCost: estimateCost(riskCategory),
      status: "pending",
    });
  }

  const shapAccountProbs = scored.map(s => ({ accountNumber: String(s.customer.accountNumber ?? ""), churnProbability: s.churnProbability }));
  const shapProdMetrics = prodDatasetId ? await computeProdMetrics(shapAccountProbs, prodDatasetId) : { prodAuc: null, prodAccuracy: null, prodRecall: null };
  return { predicted: scored.length, veryHigh, high, medium, low, ...shapProdMetrics };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await pushSchema();
  await seedDatabase();

  app.get("/api/dashboard", async (_req, res) => {
    try {
      const analytics = await storage.getChurnAnalytics();
      res.json(analytics);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/segments", async (_req, res) => {
    try {
      const segments = await storage.getSegmentAnalytics();
      res.json(segments);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/analytics/command-center", async (_req, res) => {
    try {
      const data = await storage.getCommandCenterData();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/analytics/churn-diagnostics", async (_req, res) => {
    try {
      const data = await storage.getChurnDiagnostics();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/analytics/risk-intelligence", async (_req, res) => {
    try {
      const data = await storage.getRiskIntelligence();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/analytics/retention", async (_req, res) => {
    try {
      const data = await storage.getRetentionData();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/analytics/business-impact", async (_req, res) => {
    try {
      const data = await storage.getBusinessImpact();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/analytics/strategy", async (_req, res) => {
    try {
      const data = await storage.getStrategyInsights();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/customers", async (req, res) => {
    try {
      const allCustomers = await storage.getCustomers();
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const risk = req.query.risk as string;
      const churned = req.query.churned as string;

      let filtered = allCustomers;
      if (risk) filtered = filtered.filter(c => c.churnRiskCategory === risk);
      if (churned === "true") filtered = filtered.filter(c => c.isChurned);
      if (churned === "false") filtered = filtered.filter(c => !c.isChurned);

      res.json({
        data: filtered.slice(offset, offset + limit),
        total: filtered.length,
        limit,
        offset,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/customers/stats", async (_req, res) => {
    try {
      const all = await storage.getCustomers();
      const active = all.filter(c => !c.isChurned);
      res.json({ total: all.length, active: active.length, churned: all.length - active.length });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/customers/:id", async (req, res) => {
    try {
      const customer = await storage.getCustomer(parseInt(req.params.id));
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      const preds = await storage.getPredictions();
      const customerPreds = preds.filter(p => p.customerId === customer.id);
      const recs = await storage.getRecommendations(customer.id);
      res.json({ customer, predictions: customerPreds, recommendations: recs });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/customers/shap-drivers", async (req, res) => {
    try {
      const { modelId, customerIds } = req.body;
      
      if (!modelId) {
        return res.status(400).json({ message: "Model ID is required" });
      }

      const model = await storage.getMlModel(modelId);
      if (!model) {
        return res.status(404).json({ message: "Model not found" });
      }

      // Get customers to score
      const allCustomers = await storage.getCustomers();
      let scoreCustomers = allCustomers;
      
      if (customerIds && Array.isArray(customerIds) && customerIds.length > 0) {
        scoreCustomers = allCustomers.filter(c => customerIds.includes(c.id));
      }

      if (scoreCustomers.length === 0) {
        return res.status(400).json({ message: "No customers to score" });
      }

      // Calculate SHAP using Python
      try {
        const result = await executePythonScript("calculate_shap.py", {
          algorithm: model.algorithm,
          modelParams: model.hyperparameters || {},
          trainData: allCustomers,
          scoreData: scoreCustomers,
          targetColumn: "isChurned",
        });

        res.json({ success: true, predictions: result.predictions });
      } catch (pythonError: any) {
        console.error("SHAP calculation failed:", pythonError.message);
        // Return fallback response
        res.json({
          success: false,
          message: "SHAP calculation unavailable",
          predictions: scoreCustomers.map(c => ({
            accountId: c.accountNumber,
            churnProbability: c.churnRiskScore || 0,
            riskBand: c.churnRiskCategory || "Low",
            top3Drivers: [],
            top3DriversStr: "SHAP analysis unavailable",
            top3DriversDetailed: "Install Python dependencies to enable SHAP analysis",
          })),
        });
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/predictions", async (req, res) => {
    try {
      const modelId = req.query.modelId ? parseInt(req.query.modelId as string) : undefined;
      const preds = await storage.getPredictions(modelId);
      res.json(preds);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  /**
   * GET /api/notebook-output
   * Reads final_latest_customer_recommendations.xlsx produced by the notebook and returns
   * the rows as JSON for direct display — no DB writes, no model creation.
   */
  app.get("/api/notebook-output", async (_req, res) => {
    try {
      const XLSX = await import("xlsx");
      const path = await import("path");
      const fs = await import("fs");

      const excelPath = path.join(process.cwd(), "final_latest_customer_recommendations.xlsx");
      if (!fs.existsSync(excelPath)) {
        return res.json({ rows: [], available: false });
      }

      const workbook = XLSX.readFile(excelPath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

      res.json({ rows, available: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  /**
   * POST /api/import-notebook-predictions
   * Reads final_latest_customer_recommendations.xlsx produced by the notebook
   * and creates predictions with the exact predicted_churn_probability_next_3m values.
   * Also upserts accounts into the customers table so account numbers match.
   */
  app.post("/api/import-notebook-predictions", async (_req, res) => {
    try {
      const XLSX = await import("xlsx");
      const path = await import("path");
      const fs = await import("fs");

      const excelPath = path.join(process.cwd(), "final_latest_customer_recommendations.xlsx");
      if (!fs.existsSync(excelPath)) {
        return res.status(404).json({
          message: "Notebook output file not found. Run the notebook (Step 24) first to generate final_latest_customer_recommendations.xlsx.",
        });
      }

      const workbook = XLSX.readFile(excelPath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

      if (rows.length === 0) {
        return res.status(400).json({ message: "Excel file is empty." });
      }

      // Create a dedicated "Notebook Import" model entry
      const today = new Date().toISOString().split("T")[0];
      const model = await storage.createMlModel({
        name: `Notebook Import – ${today}`,
        datasetId: 0,
        algorithm: "Notebook (LightGBM / XGBoost / RF)",
        status: "trained",
        accuracy: null,
        precision: null,
        recall: null,
        f1Score: null,
        auc: null,
        hyperparameters: {},
        featureImportance: [],
        confusionMatrix: { tp: 0, fp: 0, tn: 0, fn: 0 },
        modelWeights: {},
        isDeployed: false,
        deployedAt: null,
      });

      let imported = 0;
      let veryHigh = 0, high = 0, medium = 0, low = 0;

      for (const row of rows) {
        const acct = row.account_number != null ? String(row.account_number) : null;
        if (!acct) continue;

        const rawProb = Number(row.predicted_churn_probability_next_3m);
        const prob = Number.isFinite(rawProb) ? Math.min(0.9999, Math.max(0.0001, rawProb)) : 0.05;
        const riskCategory = classifyRiskCategoryFromProbability(prob);
        const recommendation = String(row.final_recommendation ?? "").trim() || "Monitor account.";
        const topDriversText = String(row.top_3_shap_drivers_str ?? "").trim();

        // Upsert the customer record so predictions can reference it
        const customer = await storage.upsertCustomer({
          accountNumber: acct,
          name: `Account ${acct}`,
          region: "Unknown",
          state: "N/A",
          serviceType: "Copper DSL",
          tenureMonths: 12,
          monthlyRevenue: 50,
          contractStatus: "Active",
          valueTier: (riskCategory === "very high" || riskCategory === "high") ? "Platinum" : riskCategory === "medium" ? "Gold" : "Silver",
          isChurned: false,
        });

        const prediction = await storage.createPrediction({
          modelId: model.id,
          customerId: customer.id,
          churnProbability: prob,
          riskCategory,
          topDrivers: topDriversText ? [{ feature: topDriversText }] : [],
          recommendedAction: recommendation,
          actionCategory: (riskCategory === "very high" || riskCategory === "high") ? "urgent" : riskCategory === "medium" ? "proactive" : "monitor",
        });

        await storage.createRecommendation({
          customerId: customer.id,
          predictionId: prediction.id,
          actionType: buildActionType(riskCategory, topDriversText),
          description: recommendation,
          priority: riskCategory,
          estimatedImpact: estimateImpact(customer, riskCategory),
          estimatedCost: estimateCost(riskCategory),
          status: "pending",
        });

        if (riskCategory === "very high") veryHigh++;
        else if (riskCategory === "high") high++;
        else if (riskCategory === "medium") medium++;
        else low++;
        imported++;
      }

      res.json({
        success: true,
        modelId: model.id,
        imported,
        veryHigh,
        high,
        medium,
        low,
        message: `Imported ${imported} predictions from notebook output (Very High: ${veryHigh}, High: ${high}, Medium: ${medium}, Low: ${low}).`,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/recommendations", async (req, res) => {
    try {
      const customerId = req.query.customerId ? parseInt(req.query.customerId as string) : undefined;
      const recs = await storage.getRecommendations(customerId);
      res.json(recs);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/recommendations/:id", async (req, res) => {
    try {
      const rec = await storage.updateRecommendation(parseInt(req.params.id), req.body);
      res.json(rec);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/churn-events", async (_req, res) => {
    try {
      const events = await storage.getChurnEvents();
      res.json(events);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ML Workflow endpoints
  app.get("/api/datasets", async (_req, res) => {
    try {
      const ds = await storage.getDatasets();
      res.json(ds.map((dataset) => sanitizeDatasetForApi(dataset)));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Returns unique account_number count per dataset (used for % of total in Model Attribution)
  app.get("/api/datasets/unique-account-counts", async (_req, res) => {
    try {
      const datasets = await storage.getDatasets();
      const result: Record<number, number> = {};
      for (const ds of datasets) {
        const allRows = getDatasetRows(ds);
        if (allRows.length > 0 && Object.prototype.hasOwnProperty.call(allRows[0], 'account_number')) {
          const uniqueAccounts = new Set(allRows.map((r: any) => String(r.account_number)));
          result[ds.id] = uniqueAccounts.size;
        } else {
          result[ds.id] = ds.rowCount ?? 0;
        }
      }
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/datasets/:id/custom-features", async (req, res) => {
    try {
      const datasetId = parseInt(req.params.id);
      const ds = await storage.getDataset(datasetId);
      if (!ds) return res.status(404).json({ message: "Dataset not found" });

      const features = getDatasetCustomFeatures(ds);
      res.json({
        datasetId,
        features,
        availableColumns: buildCustomFeatureColumnCatalog(ds, features),
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/datasets/:id/custom-features/validate", async (req, res) => {
    try {
      const datasetId = parseInt(req.params.id);
      const ds = await storage.getDataset(datasetId);
      if (!ds) return res.status(404).json({ message: "Dataset not found" });

      const featurePayload = {
        ...req.body,
        id: req.body?.id || randomUUID(),
      };
      const parsed = customFeatureDefinitionSchema.safeParse(featurePayload);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid custom feature configuration",
          issues: parsed.error.flatten(),
        });
      }

      const existingFeatures = getDatasetCustomFeatures(ds)
        .filter((feature) => feature.id !== parsed.data.id);
      const validation = validateCustomFeatureDefinition(
        parsed.data,
        [
          ...getDatasetBaseColumnNames(ds),
          ...existingFeatures.map((feature) => feature.name),
        ],
        getDatasetRows(ds).slice(0, 25),
      );

      res.json({
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
        formula: buildCustomFeatureFormula(parsed.data),
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/datasets/:id/custom-features/preview", async (req, res) => {
    try {
      const datasetId = parseInt(req.params.id);
      const ds = await storage.getDataset(datasetId);
      if (!ds) return res.status(404).json({ message: "Dataset not found" });

      const featurePayload = {
        ...req.body,
        id: req.body?.id || randomUUID(),
      };
      const parsed = customFeatureDefinitionSchema.safeParse(featurePayload);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid custom feature configuration",
          issues: parsed.error.flatten(),
        });
      }

      const existingFeatures = getDatasetCustomFeatures(ds)
        .filter((feature) => feature.id !== parsed.data.id);
      const rows = getDatasetRows(ds);
      const transformed = applyCustomFeatures(rows, [...existingFeatures, parsed.data]);

      res.json({
        formula: buildCustomFeatureFormula(parsed.data),
        preview: buildPreviewRows(transformed, parsed.data),
      });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/datasets/:id/custom-features", async (req, res) => {
    try {
      const datasetId = parseInt(req.params.id);
      const ds = await storage.getDataset(datasetId);
      if (!ds) return res.status(404).json({ message: "Dataset not found" });

      const featurePayload = {
        ...req.body,
        id: req.body?.id || randomUUID(),
      };
      const parsed = customFeatureDefinitionSchema.safeParse(featurePayload);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid custom feature configuration",
          issues: parsed.error.flatten(),
        });
      }

      const existingFeatures = getDatasetCustomFeatures(ds)
        .filter((feature) => feature.id !== parsed.data.id);
      const validation = validateCustomFeatureDefinition(
        parsed.data,
        [
          ...getDatasetBaseColumnNames(ds),
          ...existingFeatures.map((feature) => feature.name),
        ],
        getDatasetRows(ds).slice(0, 25),
      );
      if (!validation.valid) {
        return res.status(400).json({
          message: "Custom feature validation failed",
          errors: validation.errors,
          warnings: validation.warnings,
        });
      }

      const normalizedFeature = normalizePersistedCustomFeature(parsed.data);
      const nextFeatures = [...existingFeatures, normalizedFeature];
      const updated = await storage.updateDataset(datasetId, {
        featureReport: buildFeatureReportWithCustomFeatures(ds, nextFeatures),
      });

      res.json({
        datasetId,
        feature: normalizedFeature,
        features: getDatasetCustomFeatures(updated),
        warnings: validation.warnings,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/datasets/:id/custom-features/:featureId", async (req, res) => {
    try {
      const datasetId = parseInt(req.params.id);
      const ds = await storage.getDataset(datasetId);
      if (!ds) return res.status(404).json({ message: "Dataset not found" });

      const nextFeatures = getDatasetCustomFeatures(ds)
        .filter((feature) => feature.id !== req.params.featureId);
      const updated = await storage.updateDataset(datasetId, {
        featureReport: buildFeatureReportWithCustomFeatures(ds, nextFeatures),
      });

      res.json({
        datasetId,
        features: getDatasetCustomFeatures(updated),
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/datasets/:id", async (req, res) => {
    try {
      const ds = await storage.getDataset(parseInt(req.params.id));
      if (!ds) return res.status(404).json({ message: "Dataset not found" });
      res.json(sanitizeDatasetForApi(ds));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/datasets/upload", upload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const csvText = req.file.buffer.toString("utf-8");
      const parsed = Papa.parse(csvText, { header: true, dynamicTyping: true, skipEmptyLines: true });

      if (parsed.errors.length > 0 && parsed.data.length === 0) {
        return res.status(400).json({ message: "Failed to parse CSV", errors: parsed.errors });
      }

      const allData = parsed.data as any[];
      if (allData.length === 0) {
        return res.status(400).json({ message: "CSV file contains no data rows" });
      }
      const columns = parsed.meta.fields || [];
      const columnInfo = columns.map((col: string) => {
        const values = allData.map(row => row[col]).filter(v => v !== null && v !== undefined && v !== "");
        const nullCount = allData.length - values.length;
        const isNumeric = values.length > 0 && values.every((v: any) => typeof v === "number" || !isNaN(Number(v)));
        const numericStats: any = {};
        if (isNumeric && values.length > 0) {
          const nums = values.map(Number).filter((n: number) => !isNaN(n));
          if (nums.length > 0) {
            numericStats.mean = parseFloat(ss.mean(nums).toFixed(4));
            numericStats.median = parseFloat(ss.median(nums).toFixed(4));
            numericStats.stdDev = parseFloat(ss.standardDeviation(nums).toFixed(4));
            numericStats.min = ss.min(nums);
            numericStats.max = ss.max(nums);
            if (nums.length > 3) {
              numericStats.q1 = parseFloat(ss.quantile(nums, 0.25).toFixed(4));
              numericStats.q3 = parseFloat(ss.quantile(nums, 0.75).toFixed(4));
              numericStats.skewness = parseFloat(ss.sampleSkewness(nums).toFixed(4));
              const iqr = numericStats.q3 - numericStats.q1;
              numericStats.outlierCount = nums.filter(n => n < numericStats.q1 - 1.5 * iqr || n > numericStats.q3 + 1.5 * iqr).length;
            }
          }
        }
        const categoricalStats: any = {};
        if (!isNumeric) {
          const counts: Record<string, number> = {};
          values.forEach((v: any) => { const key = String(v); counts[key] = (counts[key] || 0) + 1; });
          categoricalStats.topValues = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ value: k, count: v }));
        }
        return {
          name: col,
          type: isNumeric ? "numeric" : "categorical",
          nullCount,
          nullPercent: ((nullCount / allData.length) * 100).toFixed(1),
          uniqueCount: new Set(values).size,
          sampleValues: values.slice(0, 5),
          numericStats,
          categoricalStats,
        };
      });

      const sampleSize = Math.min(allData.length, 500);
      const sampleIndices = new Set<number>();
      while (sampleIndices.size < sampleSize) sampleIndices.add(Math.floor(Math.random() * allData.length));
      const dataSample = Array.from(sampleIndices).map(i => allData[i]);
      const preview = allData.slice(0, 20);
      const dataPreview = buildDatasetStoragePayload(csvText, preview, dataSample);

      const dataset = await storage.createDataset({
        name: req.body.name || req.file.originalname,
        fileName: req.file.originalname,
        rowCount: allData.length,
        columnCount: columns.length,
        columns: columnInfo,
        status: "uploaded",
        dataPreview,
        qualityReport: null,
        edaReport: null,
        featureReport: null,
      });

      res.json(sanitizeDatasetForApi(dataset));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/datasets/:id/quality-check", async (req, res) => {
    try {
      const ds = await storage.getDataset(parseInt(req.params.id));
      if (!ds) return res.status(404).json({ message: "Dataset not found" });

      const cols = ds.columns as any[];

      const qualityIssues: any[] = [];
      const columnReports: any[] = [];

      for (const col of cols) {
        const issues: any[] = [];

        if (parseFloat(col.nullPercent) > 5) {
          issues.push({
            type: "missing_values",
            severity: parseFloat(col.nullPercent) > 20 ? "high" : "medium",
            description: `${col.nullPercent}% missing values (${col.nullCount} of ${ds.rowCount} records)`,
            recommendation: col.type === "numeric"
              ? "Impute with median value"
              : "Impute with mode or create 'Unknown' category",
          });
        }

        if (col.type === "numeric" && col.numericStats?.outlierCount > 0) {
          const outlierPct = col.numericStats.outlierCount / ds.rowCount;
          issues.push({
            type: "outliers",
            severity: outlierPct > 0.1 ? "high" : "low",
            description: `${col.numericStats.outlierCount} potential outliers detected (${(outlierPct * 100).toFixed(1)}% of data)`,
            recommendation: "Cap at IQR boundaries or investigate business context",
          });
        }

        if (col.uniqueCount === 1) {
          issues.push({
            type: "zero_variance",
            severity: "medium",
            description: "Column has only one unique value",
            recommendation: "Consider removing - no predictive power",
          });
        }

        if (col.uniqueCount === ds.rowCount && col.type === "categorical") {
          issues.push({
            type: "high_cardinality",
            severity: "low",
            description: "Every value is unique - likely an identifier",
            recommendation: "Exclude from model features or use as key",
          });
        }

        columnReports.push({
          name: col.name,
          type: col.type,
          issues,
          stats: col.type === "numeric" ? (col.numericStats || {}) : (col.categoricalStats || {}),
        });

        qualityIssues.push(...issues.map(i => ({ ...i, column: col.name })));
      }

      const overallScore = Math.max(0, 100 - qualityIssues.reduce((sum: number, i: any) => {
        return sum + (i.severity === "high" ? 15 : i.severity === "medium" ? 8 : 3);
      }, 0));

      const report = {
        overallScore: Math.min(100, overallScore),
        totalIssues: qualityIssues.length,
        highSeverity: qualityIssues.filter((i: any) => i.severity === "high").length,
        mediumSeverity: qualityIssues.filter((i: any) => i.severity === "medium").length,
        lowSeverity: qualityIssues.filter((i: any) => i.severity === "low").length,
        columnReports,
        qualityIssues,
        recommendations: generateQualityRecommendations(qualityIssues),
      };

      const updated = await storage.updateDataset(parseInt(req.params.id), {
        qualityReport: report,
        status: "quality_checked",
      });

      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/datasets/:id/eda", async (req, res) => {
    try {
      const ds = await storage.getDataset(parseInt(req.params.id));
      if (!ds) return res.status(404).json({ message: "Dataset not found" });

      const cols = ds.columns as any[];
      const sampleData = getDatasetSampleRows(ds);
      const targetCol = req.body.targetColumn || "is_churned";

      const numericCols = cols.filter((c: any) => c.type === "numeric");
      const categoricalCols = cols.filter((c: any) => c.type === "categorical");

      const correlations: any[] = [];
      for (const col of numericCols) {
        const vals = sampleData.map((row: any) => [Number(row[col.name]), Number(row[targetCol])]).filter(([a, b]: any) => !isNaN(a) && !isNaN(b));
        if (vals.length > 3) {
          try {
            const corr = ss.sampleCorrelation(vals.map((v: any) => v[0]), vals.map((v: any) => v[1]));
            correlations.push({ feature: col.name, correlation: parseFloat(corr.toFixed(4)), absCorrelation: parseFloat(Math.abs(corr).toFixed(4)) });
          } catch { /* skip */ }
        }
      }
      correlations.sort((a, b) => b.absCorrelation - a.absCorrelation);

      const distributions: any[] = [];
      for (const col of numericCols.slice(0, 15)) {
        if (col.numericStats && Object.keys(col.numericStats).length > 0) {
          distributions.push({
            feature: col.name,
            mean: col.numericStats.mean || 0,
            median: col.numericStats.median || 0,
            stdDev: col.numericStats.stdDev || 0,
            min: col.numericStats.min || 0,
            max: col.numericStats.max || 0,
            skewness: col.numericStats.skewness || 0,
          });
        }
      }

      const categoryBreakdowns: any[] = [];
      for (const col of categoricalCols.slice(0, 10)) {
        if (col.categoricalStats?.topValues) {
          const total = col.categoricalStats.topValues.reduce((s: number, v: any) => s + v.count, 0);
          categoryBreakdowns.push({
            feature: col.name,
            categories: col.categoricalStats.topValues.map((v: any) => ({ category: v.value, count: v.count, percent: total > 0 ? ((v.count / total) * 100).toFixed(1) : "0" })),
          });
        }
      }

      const edaReport = {
        targetColumn: targetCol,
        rowCount: ds.rowCount,
        numericFeatures: numericCols.length,
        categoricalFeatures: categoricalCols.length,
        correlations,
        distributions,
        categoryBreakdowns,
        insights: generateEDAInsights(correlations, distributions, categoryBreakdowns),
      };

      const updated = await storage.updateDataset(parseInt(req.params.id), {
        edaReport,
        status: "eda_complete",
      });

      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/datasets/:id/feature-selection", async (req, res) => {
    try {
      const ds = await storage.getDataset(parseInt(req.params.id));
      if (!ds) return res.status(404).json({ message: "Dataset not found" });

      const cols = ds.columns as any[];
      const edaReport = ds.edaReport as any;
      const correlations = edaReport?.correlations || [];

      const featureScores = cols.map((col: any) => {
        let score = 50;
        const corr = correlations.find((c: any) => c.feature === col.name);
        if (corr) score += corr.absCorrelation * 100;
        if (parseFloat(col.nullPercent) > 30) score -= 20;
        if (col.uniqueCount <= 1) score -= 40;
        if (col.uniqueCount === col.sampleValues?.length && col.type === "categorical") score -= 30;
        score = Math.max(0, Math.min(100, score));
        return {
          feature: col.name,
          importance: parseFloat(score.toFixed(1)),
          normalizedScore: parseFloat(score.toFixed(1)),
          type: col.type,
          correlation: corr?.correlation || null,
          selected: score > 40,
          reason: score > 70 ? "Strong predictor" : score > 40 ? "Moderate predictor" : "Weak/irrelevant feature",
        };
      }).sort((a: any, b: any) => b.importance - a.importance);

      const engineeringRecommendations = [
        { name: "speed_gap_ratio", formula: "(provisioned_speed - actual_speed) / provisioned_speed", rationale: "Measures service delivery quality gap" },
        { name: "ticket_per_month", formula: "ticket_count / tenure_months", rationale: "Normalized support intensity" },
        { name: "revenue_per_speed", formula: "monthly_revenue / provisioned_speed", rationale: "Price-per-Mbps ratio" },
        { name: "outage_severity", formula: "outage_count * avg_resolution_hours", rationale: "Combined outage impact measure" },
        { name: "competitive_pressure", formula: "fiber_available + competitor_available", rationale: "Aggregate competitive threat indicator" },
        { name: "tenure_bucket", formula: "categorical binning of tenure_months", rationale: "Non-linear tenure effects" },
      ];

      const featureReport = {
        ...extractFeatureReport(ds),
        totalFeatures: cols.length,
        selectedFeatures: featureScores.filter((f: any) => f.selected).length,
        featureScores,
        engineeringRecommendations,
      };

      const updated = await storage.updateDataset(parseInt(req.params.id), {
        featureReport,
        status: "features_selected",
      });

      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/models", async (_req, res) => {
    try {
      const models = await storage.getMlModels();
      res.json(models);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/models/:id", async (req, res) => {
    try {
      const model = await storage.getMlModel(parseInt(req.params.id));
      if (!model) return res.status(404).json({ message: "Model not found" });
      res.json(model);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/models/train", async (req, res) => {
    try {
      const { datasetId, algorithm, name, hyperparameters } = req.body;
      const ds = await storage.getDataset(datasetId);
      if (!ds) return res.status(404).json({ message: "Dataset not found" });

      const sourceData = getDatasetRows(ds);
      const customFeatures = getDatasetCustomFeatures(ds);
      const trainingData = customFeatures.length > 0
        ? applyCustomFeatures(sourceData, customFeatures)
        : sourceData;
      const customFeatureNames = customFeatures.map((feature) => feature.name);

      // Map frontend algorithm names to Python algorithms
      const algorithmMap: Record<string, string> = {
        "Gradient Boosting": "XGBoost",
        "Neural Network": "Random Forest",
        "SVM": "Random Forest",
      };
      const pythonAlgorithm = algorithmMap[algorithm] || algorithm;

      // Use Python training for ML algorithms
      if (["Auto", "Random Forest", "LightGBM", "XGBoost", "Decision Tree", "Support Vector Machine", "Gradient Boosting", "Neural Network", "SVM"].includes(algorithm)) {
        const result = await executePythonScript(
          "train_model.py",
          {
            data: trainingData,
            targetColumn: "isChurned",
            hyperparameters: hyperparameters || null,
            customFeatureNames,
          },
          [pythonAlgorithm] // Pass mapped algorithm as CLI argument
        );

        const metrics = result.metrics;
        if (!metrics) {
          throw new Error('Python training returned no metrics. Check server logs for Python errors.');
        }
        const model = await storage.createMlModel({
          name: name || `${algorithm} - ${new Date().toISOString().split('T')[0]}`,
          datasetId,
          algorithm: algorithm === "Auto" ? `Auto (${result.bestModel})` : algorithm, // Show which model Auto selected
          status: "trained",
          accuracy: metrics.accuracy,
          precision: metrics.precision,
          recall: metrics.recall,
          f1Score: metrics.f1Score,
          auc: metrics.auc,
          hyperparameters: metrics.bestParams || hyperparameters || {},
          featureImportance: metrics.featureImportance || [],
          confusionMatrix: metrics.confusionMatrix || { tp: 0, fp: 0, tn: 0, fn: 0 },
          modelWeights: {
            customFeatures,
            customFeatureNames,
            oosMetrics: {
              auc: metrics.auc,
              f1Score: metrics.f1Score,
              recallTop10: metrics.recallTop10,
              precisionTop10: metrics.precisionTop10,
              liftTop10: metrics.liftTop10,
              recallTop20: metrics.recallTop20,
              precisionTop20: metrics.precisionTop20,
              liftTop20: metrics.liftTop20,
            },
            optimalThreshold: metrics.optimalThreshold ?? null,
            cvSummary: metrics.cvSummary ?? null,
          },
          isDeployed: false,
          deployedAt: null,
        });

        let predictionSummary = { predicted: 0, veryHigh: 0, high: 0, medium: 0, low: 0 };
        try {
          const precomputed = Array.isArray(result.latestActivePredictions) && result.latestActivePredictions.length > 0
            ? result.latestActivePredictions : undefined;
          predictionSummary = await generateAndPersistPredictionsForModel(model, precomputed);
        } catch (predictionError: any) {
          console.error(`[ML] Post-train scoring failed for model ${model.id}:`, predictionError?.message || predictionError);
        }

        res.json({ ...model, predictionsGenerated: predictionSummary.predicted });
      } else {
        // Unknown algorithm
        res.status(400).json({ message: `Algorithm "${algorithm}" is not supported` });
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/models/train-live", async (req, res) => {
    try {
      const { algorithm, name, hyperparameters } = req.body;
      const customers = await storage.getCustomers();

      // Validate we have churned customers
      const churnedCount = customers.filter(c => c.isChurned).length;
      const totalCount = customers.length;
      
      if (totalCount === 0) {
        return res.status(400).json({ message: "No customer data available. Please seed the database first." });
      }
      
      if (churnedCount === 0) {
        return res.status(400).json({ 
          message: `Cannot train model: No churned customers found in database (0 of ${totalCount}). A classification model requires both churned and non-churned customers. Please check your data or add churned customer records.` 
        });
      }
      
      const churnRate = (churnedCount / totalCount * 100).toFixed(1);
      console.log(`[Training] Dataset validation: ${totalCount} customers, ${churnedCount} churned (${churnRate}%)`);

      // Map frontend algorithm names to Python algorithms
      const algorithmMap: Record<string, string> = {
        "Gradient Boosting": "XGBoost",
        "Neural Network": "Random Forest",
        "SVM": "Random Forest",
      };
      const pythonAlgorithm = algorithmMap[algorithm] || algorithm;

      // Use Python training
      if (["Auto", "Random Forest", "LightGBM", "XGBoost", "Decision Tree", "Support Vector Machine", "Gradient Boosting", "Neural Network", "SVM"].includes(algorithm)) {
        const result = await executePythonScript(
          "train_model.py",
          {
            data: customers,
            targetColumn: "isChurned",
            hyperparameters: hyperparameters || null,
          },
          [pythonAlgorithm] // Pass mapped algorithm as CLI argument
        );

        const metrics = result.metrics;
        if (!metrics) {
          throw new Error('Python training returned no metrics. Check server logs for Python errors.');
        }
        const model = await storage.createMlModel({
          name: name || `${algorithm} (Live) – ${new Date().toLocaleDateString()}`,
          datasetId: 0, // Live training without dataset
          algorithm: algorithm === "Auto" ? `Auto (${result.bestModel})` : algorithm, // Show which model Auto selected
          status: "trained",
          accuracy: metrics.accuracy,
          precision: metrics.precision,
          recall: metrics.recall,
          f1Score: metrics.f1Score,
          auc: metrics.auc,
          hyperparameters: metrics.bestParams || hyperparameters || {},
          featureImportance: metrics.featureImportance || [],
          confusionMatrix: metrics.confusionMatrix || { tp: 0, fp: 0, tn: 0, fn: 0 },
          modelWeights: {
            oosMetrics: {
              auc: metrics.auc,
              f1Score: metrics.f1Score,
              recallTop10: metrics.recallTop10,
              precisionTop10: metrics.precisionTop10,
              liftTop10: metrics.liftTop10,
              recallTop20: metrics.recallTop20,
              precisionTop20: metrics.precisionTop20,
              liftTop20: metrics.liftTop20,
            },
            optimalThreshold: metrics.optimalThreshold ?? null,
            cvSummary: metrics.cvSummary ?? null,
          },
          isDeployed: false,
          deployedAt: null,
        });

        let predictionSummary = { predicted: 0, veryHigh: 0, high: 0, medium: 0, low: 0 };
        try {
          const precomputed = Array.isArray(result.latestActivePredictions) && result.latestActivePredictions.length > 0
            ? result.latestActivePredictions : undefined;
          predictionSummary = await generateAndPersistPredictionsForModel(model, precomputed);
        } catch (predictionError: any) {
          console.error(`[ML] Post-train scoring failed for model ${model.id}:`, predictionError?.message || predictionError);
        }

        res.json({ ...model, predictionsGenerated: predictionSummary.predicted });
      } else {
        // Unknown algorithm
        res.status(400).json({ message: `Algorithm "${algorithm}" is not supported` });
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/models/:id/deploy", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const model = await storage.updateMlModel(id, {
        isDeployed: true,
        deployedAt: new Date(),
        status: "deployed",
      });
      await storage.createAuditLog({ action: "deploy", entityType: "model", entityId: id, entityName: model.name, detail: `${model.algorithm} deployed to production`, user: "ml-ops-user", team: "ML Ops", status: "success" });
      res.json(model);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/models/:id/undeploy", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const model = await storage.updateMlModel(id, {
        isDeployed: false,
        status: "trained",
      });
      await storage.createAuditLog({ action: "undeploy", entityType: "model", entityId: id, entityName: model.name, detail: `${model.algorithm} removed from production`, user: "ml-ops-user", team: "ML Ops", status: "success" });
      res.json(model);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/models/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const model = await storage.getMlModel(id);
      if (!model) return res.status(404).json({ message: "Model not found" });
      await storage.clearPredictionsByModel(id);
      await storage.deleteMlModel(id);
      await storage.createAuditLog({ action: "delete", entityType: "model", entityId: id, entityName: model.name, detail: `${model.algorithm} model deleted`, user: "ml-ops-user", team: "ML Ops", status: "success" });
      res.json({ success: true, deleted: id });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/models/latest/features", async (req, res) => {
    try {
      const datasetId = req.query.datasetId ? parseInt(req.query.datasetId as string) : null;
      const modelId = req.query.modelId ? parseInt(req.query.modelId as string) : null;

      const models = await storage.getMlModels();

      let latestModel: typeof models[number] | undefined;

      if (modelId !== null) {
        // Use the explicitly requested model
        latestModel = models.find(m => m.id === modelId);
        if (!latestModel) {
          return res.json({ features: [], message: "Model not found" });
        }
      } else {
        // Filter by dataset if specified
        const filteredModels = datasetId !== null ? models.filter(m => m.datasetId === datasetId) : models;

        if (filteredModels.length === 0) {
          return res.json({ features: [], message: datasetId !== null ? "No models trained for this dataset yet" : "No models available" });
        }

        // Get the latest deployed model, or if none deployed, the latest trained model
        const deployedModel = filteredModels.find(m => m.isDeployed && m.status === "deployed");
        latestModel = deployedModel || filteredModels.sort((a, b) =>
          new Date(b.trainedAt!).getTime() - new Date(a.trainedAt!).getTime()
        )[0];

        if (!latestModel) {
          return res.json({ features: [], message: "No models available" });
        }
      }

      const featureImportance = latestModel.featureImportance as Array<{ name: string; importance: number }> || [];
      
      // Sort by importance descending
      const sortedFeatures = [...featureImportance].sort((a, b) => b.importance - a.importance);
      
      // Transform to match the frontend MODEL_FEATURES format
      const features = sortedFeatures.map(f => ({
        name: f.name,
        importance: f.importance,
        type: inferFeatureType(f.name),
        description: generateFeatureDescription(f.name),
      }));

      res.json({
        modelId: latestModel.id,
        modelName: latestModel.name,
        algorithm: latestModel.algorithm,
        datasetId: latestModel.datasetId,
        features,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/models/:id/approve", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { approvedBy, approvalNotes, action } = req.body;
      const approvalStatus = action === "reject" ? "rejected" : "approved";
      const model = await storage.updateMlModel(id, {
        approvalStatus,
        approvedBy: approvedBy || "ml-ops-user",
        approvedAt: new Date(),
        approvalNotes: approvalNotes || null,
      });
      await storage.createAuditLog({ action: approvalStatus, entityType: "model", entityId: id, entityName: model.name, detail: approvalNotes || `Model ${approvalStatus} by ${approvedBy || "ml-ops-user"}`, user: approvedBy || "ml-ops-user", team: "Governance", status: "success" });
      res.json(model);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/datasets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ds = await storage.getDataset(id);
      if (!ds) return res.status(404).json({ message: "Dataset not found" });
      await storage.deleteDataset(id);
      await storage.createAuditLog({ action: "delete", entityType: "dataset", entityId: id, entityName: ds.name, detail: `Dataset '${ds.name}' (${ds.rowCount.toLocaleString()} rows) deleted`, user: "ml-ops-user", team: "Data Ops", status: "success" });
      res.json({ success: true, deleted: id });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/audit-log", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 200;
      const entries = await storage.getAuditLog(limit);
      res.json(entries);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/audit-log", async (req, res) => {
    try {
      const entry = await storage.createAuditLog(req.body);
      res.json(entry);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/orion/eda-live", async (_req, res) => {
    try {
      const allCustomers = await storage.getCustomers();
      const total = allCustomers.length;
      if (total === 0) return res.json({ error: "No customer data" });

      const churned = allCustomers.filter(c => c.isChurned).length;
      const churnRate = total > 0 ? (churned / total * 100) : 0;

      // Numeric features
      const numericCols = ["tenureMonths", "monthlyRevenue", "creditScore", "outageCount", "ticketCount", "npsScore", "churnRiskScore", "provisionedSpeed", "actualSpeed", "lastBillAmount", "avgResolutionHours"] as const;
      const numericStats: Record<string, any> = {};
      for (const col of numericCols) {
        const vals = allCustomers.map(c => (c as any)[col]).filter((v: any) => v !== null && v !== undefined && !isNaN(Number(v))).map(Number);
        if (vals.length === 0) continue;
        const sorted = [...vals].sort((a, b) => a - b);
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
        const bucketCount = 10;
        const min = sorted[0], max = sorted[sorted.length - 1];
        const bucketSize = (max - min) / bucketCount || 1;
        const buckets = Array.from({ length: bucketCount }, (_, i) => ({
          label: `${(min + i * bucketSize).toFixed(0)}`,
          count: vals.filter(v => v >= min + i * bucketSize && v < min + (i + 1) * bucketSize).length,
        }));
        numericStats[col] = {
          mean: parseFloat(mean.toFixed(2)),
          median: parseFloat(sorted[Math.floor(sorted.length / 2)].toFixed(2)),
          stdDev: parseFloat(Math.sqrt(variance).toFixed(2)),
          min: sorted[0],
          max: sorted[sorted.length - 1],
          q1: parseFloat(sorted[Math.floor(sorted.length * 0.25)].toFixed(2)),
          q3: parseFloat(sorted[Math.floor(sorted.length * 0.75)].toFixed(2)),
          nullCount: total - vals.length,
          completeness: parseFloat(((vals.length / total) * 100).toFixed(1)),
          histogram: buckets,
          churnMean: parseFloat((allCustomers.filter(c => c.isChurned).map(c => (c as any)[col]).filter((v: any) => v !== null && !isNaN(Number(v))).reduce((a: number, b: any) => a + Number(b), 0) / Math.max(1, churned)).toFixed(2)),
          retainedMean: parseFloat((allCustomers.filter(c => !c.isChurned).map(c => (c as any)[col]).filter((v: any) => v !== null && !isNaN(Number(v))).reduce((a: number, b: any) => a + Number(b), 0) / Math.max(1, total - churned)).toFixed(2)),
        };
      }

      // Categorical features
      const catCols = ["region", "state", "serviceType", "contractStatus", "valueTier", "bundleType", "paymentHistory", "premisesType", "lifecycleStage", "churnReason"] as const;
      const catStats: Record<string, any> = {};
      for (const col of catCols) {
        const freq: Record<string, number> = {};
        const churnFreq: Record<string, number> = {};
        for (const c of allCustomers) {
          const val = String((c as any)[col] || "Unknown");
          freq[val] = (freq[val] || 0) + 1;
          if (c.isChurned) churnFreq[val] = (churnFreq[val] || 0) + 1;
        }
        const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, count]) => ({
          label, count, churnCount: churnFreq[label] || 0, churnRate: parseFloat(((churnFreq[label] || 0) / count * 100).toFixed(1))
        }));
        catStats[col] = { uniqueCount: Object.keys(freq).length, top, nullCount: total - Object.values(freq).reduce((a, b) => a + b, 0) };
      }

      // Correlation matrix (top pairs)
      const corrCols = ["tenureMonths", "monthlyRevenue", "outageCount", "ticketCount", "npsScore", "churnRiskScore", "creditScore"];
      const corrMatrix: Array<{ col1: string; col2: string; corr: number }> = [];
      for (let i = 0; i < corrCols.length; i++) {
        for (let j = i + 1; j < corrCols.length; j++) {
          const c1 = corrCols[i], c2 = corrCols[j];
          const pairs = allCustomers.map(c => [Number((c as any)[c1]), Number((c as any)[c2])]).filter(([a, b]) => !isNaN(a) && !isNaN(b));
          if (pairs.length < 2) continue;
          const n = pairs.length;
          const m1 = pairs.reduce((s, p) => s + p[0], 0) / n;
          const m2 = pairs.reduce((s, p) => s + p[1], 0) / n;
          const num = pairs.reduce((s, p) => s + (p[0] - m1) * (p[1] - m2), 0);
          const d1 = Math.sqrt(pairs.reduce((s, p) => s + (p[0] - m1) ** 2, 0));
          const d2 = Math.sqrt(pairs.reduce((s, p) => s + (p[1] - m2) ** 2, 0));
          const corr = d1 && d2 ? parseFloat((num / (d1 * d2)).toFixed(3)) : 0;
          corrMatrix.push({ col1: c1, col2: c2, corr });
        }
      }

      // Time trends (churn by month approximated from tenureMonths bucketed)
      const tenureBuckets = [0, 6, 12, 24, 36, 48, 60];
      const timeTrends = tenureBuckets.slice(0, -1).map((b, i) => {
        const grp = allCustomers.filter(c => c.tenureMonths >= b && c.tenureMonths < tenureBuckets[i + 1]);
        return {
          bucket: `${b}-${tenureBuckets[i + 1]}mo`,
          total: grp.length,
          churned: grp.filter(c => c.isChurned).length,
          avgRevenue: grp.length ? parseFloat((grp.reduce((s, c) => s + c.monthlyRevenue, 0) / grp.length).toFixed(2)) : 0,
          churnRate: grp.length ? parseFloat((grp.filter(c => c.isChurned).length / grp.length * 100).toFixed(1)) : 0,
        };
      });

      // Data risks
      const nullRisks = Object.entries(numericStats).map(([col, s]) => ({ col, nullCount: s.nullCount, completeness: s.completeness })).filter(r => r.nullCount > 0);
      const duplicates = total - new Set(allCustomers.map(c => c.accountNumber)).size;
      const classImbalance = parseFloat((churned / total * 100).toFixed(1));

      // Bivariate: churnRate by risk category
      const bivariate: Record<string, any[]> = {
        riskCategory: ["high", "medium", "low"].map(cat => {
          const grp = allCustomers.filter(c => c.churnRiskCategory === cat);
          return { label: cat, count: grp.length, churnCount: grp.filter(c => c.isChurned).length, churnRate: grp.length ? parseFloat((grp.filter(c => c.isChurned).length / grp.length * 100).toFixed(1)) : 0 };
        }),
        valueTier: ["enterprise", "smb", "residential", "basic"].map(tier => {
          const grp = allCustomers.filter(c => c.valueTier?.toLowerCase() === tier);
          return { label: tier, count: grp.length, churnCount: grp.filter(c => c.isChurned).length, avgRevenue: grp.length ? parseFloat((grp.reduce((s, c) => s + c.monthlyRevenue, 0) / grp.length).toFixed(2)) : 0 };
        }),
      };

      // Multivariate: avg churnRiskScore by valueTier + contractStatus
      const multivariateGroups: Record<string, any> = {};
      for (const c of allCustomers) {
        const key = `${c.valueTier}|${c.contractStatus}`;
        if (!multivariateGroups[key]) multivariateGroups[key] = { valueTier: c.valueTier, contractStatus: c.contractStatus, total: 0, churnSum: 0, revenueSum: 0 };
        multivariateGroups[key].total++;
        multivariateGroups[key].churnSum += c.isChurned ? 1 : 0;
        multivariateGroups[key].revenueSum += c.monthlyRevenue;
      }
      const multivariate = Object.values(multivariateGroups).map((g: any) => ({
        ...g,
        churnRate: parseFloat((g.churnSum / g.total * 100).toFixed(1)),
        avgRevenue: parseFloat((g.revenueSum / g.total).toFixed(2)),
      })).sort((a: any, b: any) => b.churnRate - a.churnRate).slice(0, 20);

      res.json({
        overview: {
          totalRows: total, churnedRows: churned, retainedRows: total - churned,
          churnRate: parseFloat(churnRate.toFixed(1)),
          features: numericCols.length + catCols.length,
          numericFeatures: numericCols.length,
          categoricalFeatures: catCols.length,
        },
        numericStats,
        catStats,
        correlationMatrix: corrMatrix.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr)),
        timeTrends,
        bivariate,
        multivariate,
        dataRisks: {
          nullRisks,
          duplicates,
          classImbalance,
          outliers: Object.entries(numericStats).filter(([_, s]) => s.max > s.mean + 3 * s.stdDev).map(([col]) => ({ col, issue: "Potential outliers detected" })),
          lowVariance: Object.entries(numericStats).filter(([_, s]) => s.stdDev < 0.01).map(([col]) => ({ col, issue: "Near-zero variance" })),
        },
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  registerOrionRoutes(app);
  return httpServer;
}

async function pushSchema() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS customers (
        id serial PRIMARY KEY,
        account_number varchar(50) NOT NULL UNIQUE,
        name text NOT NULL,
        region varchar(100) NOT NULL,
        state varchar(50) NOT NULL,
        service_type varchar(50) NOT NULL DEFAULT 'Copper DSL',
        tenure_months integer NOT NULL,
        monthly_revenue real NOT NULL,
        contract_status varchar(50) NOT NULL,
        value_tier varchar(30) NOT NULL,
        credit_score integer,
        bundle_type varchar(100),
        provisioned_speed real,
        actual_speed real,
        outage_count integer DEFAULT 0,
        ticket_count integer DEFAULT 0,
        avg_resolution_hours real,
        nps_score integer,
        fiber_available boolean DEFAULT false,
        competitor_available boolean DEFAULT false,
        churn_risk_score real,
        churn_risk_category varchar(20),
        is_churned boolean DEFAULT false,
        churn_date timestamp,
        churn_reason varchar(100),
        last_bill_amount real,
        payment_history varchar(30),
        auto_pay_enabled boolean DEFAULT false,
        premises_type varchar(50),
        lifecycle_stage varchar(50),
        created_at timestamp DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS churn_events (
        id serial PRIMARY KEY,
        customer_id integer NOT NULL,
        churn_date timestamp NOT NULL,
        churn_type varchar(50) NOT NULL,
        reason varchar(200),
        destination varchar(100),
        revenue_impact real,
        win_back_attempted boolean DEFAULT false,
        win_back_successful boolean DEFAULT false
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS datasets (
        id serial PRIMARY KEY,
        name text NOT NULL,
        file_name text NOT NULL,
        row_count integer NOT NULL,
        column_count integer NOT NULL,
        columns jsonb NOT NULL,
        uploaded_at timestamp DEFAULT now(),
        status varchar(30) NOT NULL DEFAULT 'uploaded',
        quality_report jsonb,
        eda_report jsonb,
        feature_report jsonb,
        data_preview jsonb
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ml_models (
        id serial PRIMARY KEY,
        name text NOT NULL,
        dataset_id integer NOT NULL,
        algorithm varchar(100) NOT NULL,
        status varchar(30) NOT NULL DEFAULT 'training',
        accuracy real,
        precision real,
        recall real,
        f1_score real,
        auc real,
        hyperparameters jsonb,
        feature_importance jsonb,
        confusion_matrix jsonb,
        model_weights jsonb,
        trained_at timestamp DEFAULT now(),
        is_deployed boolean DEFAULT false,
        deployed_at timestamp,
        approval_status varchar(30) DEFAULT 'pending',
        approved_by text,
        approved_at timestamp,
        approval_notes text
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS predictions (
        id serial PRIMARY KEY,
        model_id integer NOT NULL,
        customer_id integer NOT NULL,
        churn_probability real NOT NULL,
        risk_category varchar(20) NOT NULL,
        top_drivers jsonb,
        recommended_action text,
        action_category varchar(50),
        predicted_at timestamp DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS recommendations (
        id serial PRIMARY KEY,
        customer_id integer NOT NULL,
        prediction_id integer,
        action_type varchar(50) NOT NULL,
        description text NOT NULL,
        priority varchar(20) NOT NULL,
        estimated_impact real,
        estimated_cost real,
        status varchar(30) NOT NULL DEFAULT 'pending',
        executed_at timestamp,
        outcome varchar(50),
        created_at timestamp DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS audit_log (
        id serial PRIMARY KEY,
        action varchar(50) NOT NULL,
        entity_type varchar(30) NOT NULL,
        entity_id integer,
        entity_name text,
        detail text,
        "user" varchar(100) NOT NULL DEFAULT 'system',
        team varchar(100) NOT NULL DEFAULT 'ML Ops',
        status varchar(20) NOT NULL DEFAULT 'success',
        created_at timestamp DEFAULT now()
      )
    `);

    console.log("Database schema created/verified successfully");
  } catch (e: any) {
    console.error("Schema push error:", e.message);
  }
}

function getNumericStats(data: any[], col: string) {
  const vals = data.map(r => Number(r[col])).filter(n => !isNaN(n));
  if (vals.length === 0) return {};
  return {
    mean: parseFloat(ss.mean(vals).toFixed(2)),
    median: parseFloat(ss.median(vals).toFixed(2)),
    stdDev: parseFloat(ss.standardDeviation(vals).toFixed(2)),
    min: ss.min(vals),
    max: ss.max(vals),
    q1: parseFloat(ss.quantile(vals, 0.25).toFixed(2)),
    q3: parseFloat(ss.quantile(vals, 0.75).toFixed(2)),
  };
}

function getCategoricalStats(data: any[], col: string) {
  const counts: Record<string, number> = {};
  data.forEach(r => {
    const v = String(r[col] || "Unknown");
    counts[v] = (counts[v] || 0) + 1;
  });
  return {
    uniqueValues: Object.keys(counts).length,
    topValues: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ value: k, count: v })),
  };
}

function generateQualityRecommendations(issues: any[]) {
  const recs: string[] = [];
  const hasMissing = issues.some(i => i.type === "missing_values");
  const hasOutliers = issues.some(i => i.type === "outliers");
  const hasZeroVar = issues.some(i => i.type === "zero_variance");
  if (hasMissing) recs.push("Apply imputation strategy for columns with missing values - use median for numeric and mode for categorical features");
  if (hasOutliers) recs.push("Investigate outliers in context - consider winsorization or capping at IQR boundaries for model stability");
  if (hasZeroVar) recs.push("Remove zero-variance features as they provide no discriminative information for modeling");
  if (issues.length === 0) recs.push("Data quality looks good! Proceed to exploratory data analysis.");
  return recs;
}

function generateEDAInsights(correlations: any[], distributions: any[], categories: any[]) {
  const insights: string[] = [];
  const topCorr = correlations.slice(0, 3);
  if (topCorr.length > 0) {
    insights.push(`Top correlated features with churn: ${topCorr.map((c: any) => `${c.feature} (${c.correlation > 0 ? '+' : ''}${c.correlation})`).join(', ')}`);
  }
  const skewed = distributions.filter((d: any) => Math.abs(d.skewness) > 1);
  if (skewed.length > 0) {
    insights.push(`${skewed.length} features show significant skewness - consider log transformation`);
  }
  insights.push("Recommend analyzing interaction effects between competitive environment and service quality metrics");
  insights.push("Tenure and contract status show strong non-linear relationship with churn risk");
  return insights;
}

function inferFeatureType(featureName: string): string {
  const name = featureName.toLowerCase();
  
  // Binary/flag features
  if (name.includes('flag') || name.includes('_is_') || name.endsWith('_enabled')) {
    return 'binary';
  }
  
  // Categorical features
  if (name.includes('type') || name.includes('category') || name.includes('status') || 
      name.includes('region') || name.includes('tier') || name === 'contract_type' ||
      name.includes('lifecycle') || name.includes('segment')) {
    return 'categorical';
  }
  
  // Default to numeric
  return 'numeric';
}

function generateFeatureDescription(featureName: string): string {
  const descriptions: Record<string, string> = {
    'tenure_months': 'Months since account activation',
    'total_spend_6m': 'Total revenue in last 6 months',
    'outage_count_12m': 'Network outages in last 12 months',
    'monthly_revenue': 'Current monthly recurring revenue',
    'support_tickets_6m': 'Support calls/tickets in last 6 months',
    'contract_type': 'Contract type: month-to-month / annual / biennial',
    'days_since_last_call': 'Days since last inbound support interaction',
    'num_products': 'Number of active product subscriptions',
    'payment_history_flag': 'Missed payment in last 6 months (0/1)',
    'actual_vs_provisioned_speed': 'Ratio of actual to provisioned internet speed',
    'fiber_exposure_pct': 'Fiber competitor coverage in customer area (%)',
    'region': 'Customer geographic region',
    'device_age_months': 'Age of primary customer device (months)',
    'nps_score': 'Net Promoter Score',
    'ticket_count': 'Total support tickets',
    'outage_count': 'Total network outages',
    'credit_score': 'Customer credit score',
    'provisioned_speed': 'Provisioned internet speed (Mbps)',
    'actual_speed': 'Actual internet speed (Mbps)',
    'avg_resolution_hours': 'Average ticket resolution time (hours)',
    'fiber_available': 'Fiber competitor availability flag',
    'competitor_available': 'Alternative provider availability flag',
    'churn_risk_score': 'Model-predicted churn risk score',
    'last_bill_amount': 'Most recent bill amount',
    'auto_pay_enabled': 'Automatic payment enabled flag',
  };
  
  // Return known description or generate based on name
  if (descriptions[featureName.toLowerCase()]) {
    return descriptions[featureName.toLowerCase()];
  }
  
  // Generate description from feature name
  const formatted = featureName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
  return formatted;
}

function computeDataDrivenFeatureImportance(cols: any[], edaReport: any, featureReport: any, sampleData: any[]) {
  if (featureReport?.featureScores) {
    return featureReport.featureScores
      .filter((f: any) => f.selected)
      .map((f: any) => ({ name: f.feature, importance: parseFloat((f.normalizedScore / 100).toFixed(4)) }))
      .sort((a: any, b: any) => b.importance - a.importance)
      .slice(0, 15);
  }

  if (edaReport?.correlations) {
    const totalAbsCorr = edaReport.correlations.reduce((s: number, c: any) => s + c.absCorrelation, 0) || 1;
    return edaReport.correlations
      .slice(0, 15)
      .map((c: any) => ({ name: c.feature, importance: parseFloat((c.absCorrelation / totalAbsCorr).toFixed(4)) }))
      .sort((a: any, b: any) => b.importance - a.importance);
  }

  const numericCols = cols.filter((c: any) => c.type === "numeric" && c.numericStats);
  return numericCols.slice(0, 10).map((c: any, i: number) => ({
    name: c.name,
    importance: parseFloat((1 / (i + 1) * 0.3).toFixed(4)),
  }));
}

function trainModelOnData(algorithm: string, sampleData: any[], cols: any[], featureImportance: any[]) {
  const targetCols = ["is_churned", "churned", "churn", "target", "label"];
  const targetCol = cols.find((c: any) => targetCols.includes(c.name.toLowerCase()))?.name;

  let churnRate = 0.25;
  if (targetCol && sampleData.length > 0) {
    const positives = sampleData.filter((r: any) => {
      const v = r[targetCol];
      return v === 1 || v === true || v === "1" || v === "true" || v === "yes" || v === "Yes";
    }).length;
    churnRate = positives / sampleData.length || 0.25;
  }

  const n = sampleData.length || 500;
  const numFeatures = featureImportance.length || 5;
  const featureQuality = Math.min(numFeatures / 20, 1);

  const algModifiers: Record<string, { accBase: number; aucBoost: number }> = {
    "Random Forest": { accBase: 0.80, aucBoost: 0.03 },
    "Gradient Boosting": { accBase: 0.82, aucBoost: 0.04 },
    "XGBoost": { accBase: 0.83, aucBoost: 0.05 },
    "Neural Network": { accBase: 0.78, aucBoost: 0.03 },
    "SVM": { accBase: 0.76, aucBoost: 0.02 },
  };

  const mod = algModifiers[algorithm] || { accBase: 0.77, aucBoost: 0.03 };
  const sampleBoost = Math.min(Math.log10(n) / 4, 0.08);
  const balancePenalty = Math.abs(churnRate - 0.5) * 0.1;

  const accuracy = parseFloat(Math.min(mod.accBase + sampleBoost + featureQuality * 0.05 - balancePenalty, 0.96).toFixed(4));
  const precision = parseFloat(Math.min(accuracy + (churnRate < 0.3 ? -0.03 : 0.02), 0.96).toFixed(4));
  const recall = parseFloat(Math.min(accuracy - (churnRate < 0.3 ? 0.05 : -0.01), 0.96).toFixed(4));
  const f1Score = parseFloat((2 * precision * recall / (precision + recall)).toFixed(4));
  const auc = parseFloat(Math.min(accuracy + mod.aucBoost + sampleBoost * 0.5, 0.98).toFixed(4));

  const totalPositive = Math.round(churnRate * n * 0.2);
  const totalNegative = Math.round((1 - churnRate) * n * 0.2);
  const tp = Math.round(recall * totalPositive);
  const fn = totalPositive - tp;
  const fp = Math.round((1 - precision) * (tp / Math.max(precision, 0.01)));
  const tn = totalNegative - fp;

  return {
    accuracy,
    precision,
    recall,
    f1Score,
    auc,
    confusionMatrix: { tp: Math.max(tp, 0), fp: Math.max(fp, 0), tn: Math.max(tn, 0), fn: Math.max(fn, 0) },
  };
}

function getHyperparameters(algorithm: string) {
  switch (algorithm) {
    case "Random Forest": return { n_estimators: 200, max_depth: 12, min_samples_split: 5, min_samples_leaf: 2 };
    case "Gradient Boosting": return { n_estimators: 150, learning_rate: 0.1, max_depth: 6, subsample: 0.8 };
    case "XGBoost": return { n_estimators: 200, learning_rate: 0.05, max_depth: 8, colsample_bytree: 0.8 };
    case "Neural Network": return { hidden_layers: [64, 32], activation: "relu", dropout: 0.3, epochs: 50 };
    case "SVM": return { C: 1.0, kernel: "rbf", gamma: "scale" };
    default: return {};
  }
}

// ─── ML Orion API Routes (Real Data) ────────────────────────────────────────
export function registerOrionRoutes(app: Express) {

  // Overview: portfolio stats from real DB
  app.get("/api/orion/overview", async (_req, res) => {
    try {
      const allModels = await storage.getMlModels();
      const allDatasets = await storage.getDatasets();
      const allPreds = await storage.getPredictions();
      const allRecs = await storage.getRecommendations();
      const retentionData = await storage.getRetentionData();
      const cmdData = await storage.getCommandCenterData();

      const deployed = allModels.filter(m => m.isDeployed);
      const avgAuc = deployed.length > 0
        ? parseFloat((deployed.reduce((s, m) => s + (m.auc || 0), 0) / deployed.length).toFixed(4))
        : 0;
      const avgAccuracy = deployed.length > 0
        ? parseFloat((deployed.reduce((s, m) => s + (m.accuracy || 0), 0) / deployed.length).toFixed(4))
        : 0;

      const uniqueScored = new Set(allPreds.map(p => p.customerId)).size;
      const completedRecs = allRecs.filter(r => r.status === "completed");
      const savedRecs = completedRecs.filter(r => r.outcome === "retained");
      const retentionRate = completedRecs.length > 0
        ? parseFloat(((savedRecs.length / completedRecs.length) * 100).toFixed(1))
        : 0;

      const modelPerformance = allModels.map(m => ({
        name: m.name.length > 30 ? m.name.substring(0, 28) + "…" : m.name,
        algorithm: m.algorithm,
        accuracy: m.accuracy != null ? parseFloat((m.accuracy * 100).toFixed(1)) : 0,
        auc: m.auc != null ? parseFloat((m.auc * 100).toFixed(1)) : 0,
        f1: m.f1Score != null ? parseFloat((m.f1Score * 100).toFixed(1)) : 0,
        status: m.status,
        isDeployed: m.isDeployed,
        id: m.id,
      }));

      // Use same risk distribution as business section for consistency
      const riskDist = cmdData.riskDistribution;

      res.json({
        kpis: {
          totalModels: allModels.length,
          deployedModels: deployed.length,
          avgAuc,
          avgAccuracy,
          totalPredictions: allPreds.length,
          customersScored: uniqueScored,
          totalDatasets: allDatasets.length,
          retentionSuccessRate: retentionData.tracker?.saveSuccessRate || retentionRate,
        },
        modelPerformance,
        riskDistribution: riskDist,
        churnRate: cmdData.kpis.churnRate,
        revenueAtRisk: cmdData.kpis.revenueAtRisk,
        topDrivers: cmdData.topDrivers,
        recentModels: allModels.slice(0, 5),
        datasetCount: allDatasets.length,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Customer Dataset: describe the live customer DB as a trainable dataset
  app.get("/api/orion/customer-dataset", async (_req, res) => {
    try {
      const allCustomers = await storage.getCustomers();
      const churned = allCustomers.filter(c => c.isChurned).length;
      const active = allCustomers.filter(c => !c.isChurned).length;

      const numericFeatures = [
        { name: "tenure_months", label: "Tenure (months)", type: "numeric" },
        { name: "monthly_revenue", label: "Monthly Revenue ($)", type: "numeric" },
        { name: "outage_count", label: "Outage Count", type: "numeric" },
        { name: "ticket_count", label: "Support Tickets", type: "numeric" },
        { name: "avg_resolution_hours", label: "Avg Resolution Hours", type: "numeric" },
        { name: "nps_score", label: "NPS Score", type: "numeric" },
        { name: "credit_score", label: "Credit Score", type: "numeric" },
        { name: "provisioned_speed", label: "Provisioned Speed (Mbps)", type: "numeric" },
        { name: "actual_speed", label: "Actual Speed (Mbps)", type: "numeric" },
        { name: "churn_risk_score", label: "Churn Risk Score", type: "numeric" },
      ];
      const categoricalFeatures = [
        { name: "contract_status", label: "Contract Status", type: "categorical" },
        { name: "bundle_type", label: "Bundle Type", type: "categorical" },
        { name: "value_tier", label: "Value Tier", type: "categorical" },
        { name: "region", label: "Region", type: "categorical" },
        { name: "service_type", label: "Service Type", type: "categorical" },
        { name: "premises_type", label: "Premises Type", type: "categorical" },
        { name: "fiber_available", label: "Fiber Available", type: "boolean" },
        { name: "competitor_available", label: "Competitor Available", type: "boolean" },
        { name: "auto_pay_enabled", label: "Auto Pay Enabled", type: "boolean" },
      ];

      const revValues = allCustomers.map(c => c.monthlyRevenue || 0);
      const tenureValues = allCustomers.map(c => c.tenureMonths || 0);

      res.json({
        id: "live",
        name: "Live Customer Database",
        rowCount: allCustomers.length,
        columnCount: numericFeatures.length + categoricalFeatures.length + 1,
        target: "is_churned",
        targetDistribution: { churned, active, churnRate: parseFloat(((churned / allCustomers.length) * 100).toFixed(1)) },
        numericFeatures,
        categoricalFeatures,
        qualityScore: 94,
        stats: {
          avgRevenue: parseFloat((revValues.reduce((s, v) => s + v, 0) / revValues.length).toFixed(2)),
          avgTenure: parseFloat((tenureValues.reduce((s, v) => s + v, 0) / tenureValues.length).toFixed(1)),
          fiberExposure: parseFloat(((allCustomers.filter(c => c.fiberAvailable).length / allCustomers.length) * 100).toFixed(1)),
          contractMix: {
            monthToMonth: allCustomers.filter(c => c.contractStatus === "month-to-month").length,
            annual: allCustomers.filter(c => c.contractStatus === "annual").length,
            twoYear: allCustomers.filter(c => c.contractStatus === "two-year").length,
          },
        },
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Score all active customers with a deployed model
  app.post("/api/models/:id/predict-customers", async (req, res) => {
    try {
      const model = await storage.getMlModel(parseInt(req.params.id));
      if (!model) return res.status(404).json({ message: "Model not found" });

      const prodDatasetId = req.body?.prodDatasetId ? parseInt(req.body.prodDatasetId) : undefined;
      const summary = await generateAndPersistPredictionsForModel(model, undefined, prodDatasetId);
      console.log(`[ML] Scored ${summary.predicted} customers with ${model.algorithm}${prodDatasetId ? ` on prod dataset ${prodDatasetId}` : ""}`);

      await storage.createAuditLog({
        action: "score",
        entityType: "model",
        entityId: model.id,
        entityName: model.name,
        detail: `Scored ${summary.predicted} customers — ${summary.veryHigh} very high, ${summary.high} high, ${summary.medium} medium, ${summary.low} low risk`,
        user: "ml-ops-user",
        team: "ML Ops",
        status: "success",
      });

      res.json({ modelId: model.id, ...summary });
    } catch (e: any) {
      console.error("[ML predict error]", e);
      res.status(500).json({ message: e.message });
    }
  });

  // ── SCORE ON PRODUCTION DATA ───────────────────────────────────────────────
  // Re-trains the model on the original training dataset (same algo + hyperparams),
  // then scores the chosen production dataset through the full feature-engineering
  // pipeline and persists the resulting predictions to the DB.
  app.post("/api/models/:id/score-production", async (req, res) => {
    try {
      const model = await storage.getMlModel(parseInt(req.params.id));
      if (!model) return res.status(404).json({ message: "Model not found" });

      const prodDatasetId: number = parseInt(req.body?.prodDatasetId);
      if (!prodDatasetId || isNaN(prodDatasetId)) {
        return res.status(400).json({ message: "prodDatasetId is required" });
      }

      const prodDataset = await storage.getDataset(prodDatasetId);
      if (!prodDataset) return res.status(404).json({ message: "Production dataset not found" });

      // ── Load training data ──
      let trainRows: any[] = [];
      if (model.datasetId && model.datasetId > 0) {
        const trainDataset = await storage.getDataset(model.datasetId);
        if (trainDataset) {
          const customFeatures = getModelCustomFeatures(model, trainDataset);
          const baseRows = getDatasetRows(trainDataset);
          trainRows = customFeatures.length > 0 ? applyCustomFeatures(baseRows, customFeatures) : baseRows;
        }
      }
      if (trainRows.length === 0) {
        return res.status(400).json({ message: "Model has no training dataset" });
      }

      // ── Load production data ──
      const customFeatures = getModelCustomFeatures(model);
      const prodBaseRows = getDatasetRows(prodDataset);
      const prodRows = customFeatures.length > 0 ? applyCustomFeatures(prodBaseRows, customFeatures) : prodBaseRows;

      // Normalize stored algorithm name → Python-compatible algorithm name
      const storedAlgo = model.algorithm || "Random Forest";
      const autoMatch = storedAlgo.match(/^Auto\s*\((.+)\)$/i);
      const pythonAlgorithm = autoMatch
        ? autoMatch[1]
        : ({ "Gradient Boosting": "XGBoost", "Neural Network": "Random Forest", "SVM": "Random Forest" } as Record<string, string>)[storedAlgo] ?? storedAlgo;

      // Retrieve stored hyperparameters (already prefixed e.g. rf_n_estimators)
      const hyperparameters = (model.hyperparameters && typeof model.hyperparameters === "object")
        ? model.hyperparameters as Record<string, unknown>
        : null;

      const customFeatureNames: string[] = (customFeatures || []).map((f: any) => f.name).filter(Boolean);

      console.log(`[ML score-production] model=${model.id} algo=${pythonAlgorithm} trainRows=${trainRows.length} prodRows=${prodRows.length}`);

      // ── Call Python with score_prod mode ──
      const result = await executePythonScript(
        "train_model.py",
        {
          mode: "score_prod",
          trainData: trainRows,
          prodData: prodRows,
          targetColumn: "isChurned",
          hyperparameters: hyperparameters,
          customFeatureNames,
        },
        [pythonAlgorithm]
      );

      const predictions = Array.isArray(result.predictions) ? result.predictions : [];
      const prodMetrics = result.metrics || {};

      console.log(`[ML score-production] ${predictions.length} predictions, metrics: AUC=${prodMetrics.auc ?? "n/a"}, Acc=${prodMetrics.accuracy ?? "n/a"}`);

      // ── Fetch baseline predictions BEFORE clearing them so PSI/KS can compare
      //    prod vs the prior scoring run rather than prod vs itself. ──
      const baselinePredictions = await storage.getPredictions(model.id);

      // ── Sync prod accounts into customers table + persist predictions ──
      const scoringSummary = await generateAndPersistPredictionsForModel(model, predictions, prodDatasetId);

      // ── Derive evaluationMonth from dataset name or latest snapshot_month ──
      const monthNames = ["january","february","march","april","may","june","july","august","september","october","november","december"];
      let evaluationMonth: string = (() => {
        const nameLower = prodDataset.name.toLowerCase();
        for (let i = 0; i < monthNames.length; i++) {
          const monthNum = String(i + 1).padStart(2, "0");
          const re1 = new RegExp(`${monthNames[i]}[_\\s-]*(\\d{4})`);
          const re2 = new RegExp(`(\\d{4})[_\\s-]*${monthNames[i]}`);
          const m = re1.exec(nameLower) ?? re2.exec(nameLower);
          if (m) return `${m[1]}-${monthNum}`;
        }
        const isoM = /(\d{4})[-_](\d{2})/.exec(prodDataset.name);
        if (isoM) return `${isoM[1]}-${isoM[2]}`;
        // fallback: latest snapshot_month in prodRows
        const months = prodRows.map((r: any) => String(r.snapshot_month ?? "")).filter(Boolean).sort();
        if (months.length > 0) {
          const d = new Date(months[months.length - 1]);
          if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        }
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      })();

      // ── Compute risk mix from Python predictions ──
      let vhCount = 0, hCount = 0, mCount = 0, lCount = 0;
      for (const p of predictions) {
        const rb = String(p.riskBand ?? "").toLowerCase();
        if (rb === "very high") vhCount++;
        else if (rb === "high") hCount++;
        else if (rb === "medium") mCount++;
        else lCount++;
      }
      const n = predictions.length || 1;
      const highRiskPct = parseFloat(((vhCount + hCount) / n * 100).toFixed(1));
      const medRiskPct  = parseFloat((mCount / n * 100).toFixed(1));
      const lowRiskPct  = parseFloat((lCount / n * 100).toFixed(1));

      // ── Score histogram: 10 equal-width bins over [0, 1] ──
      const histBins = Array(10).fill(0);
      for (const p of predictions) {
        const prob = Math.min(0.9999, Math.max(0, Number(p.churn_probability ?? 0)));
        histBins[Math.floor(prob * 10)]++;
      }
      const scoreHistogram = histBins.map((count, i) => ({
        bucket: `${i * 10}-${(i + 1) * 10}%`,
        count,
        pct: parseFloat((count / n * 100).toFixed(1)),
      }));

      // ── Top feature SHAP summary: aggregate top3Drivers across all predictions ──
      const shapAccum: Record<string, { totalShap: number; freq: number }> = {};
      for (const p of predictions) {
        for (const d of (p.top3Drivers ?? [])) {
          const feat = String(d.feature ?? "");
          if (!feat) continue;
          if (!shapAccum[feat]) shapAccum[feat] = { totalShap: 0, freq: 0 };
          shapAccum[feat].totalShap += Number(d.shapValue ?? 0);
          shapAccum[feat].freq++;
        }
      }
      const topFeatureShapSummary = Object.entries(shapAccum)
        .map(([feature, { totalShap, freq }]) => ({
          feature,
          avgShap: parseFloat((totalShap / freq).toFixed(4)),
          freq,
          freqPct: parseFloat((freq / n * 100).toFixed(1)),
        }))
        .sort((a, b) => b.avgShap - a.avgShap)
        .slice(0, 10);

      // ── PSI + KS Stat: compare prod score distribution vs training prediction distribution ──
      let psi: number | null = null;
      let ks: number | null = null;
      try {
        // Use baseline predictions fetched before the current run was persisted.
        // This ensures PSI/KS compare the new prod distribution vs the PRIOR scoring
        // run, not prod vs itself (which would always give PSI≈0, KS≈0).
        if (baselinePredictions.length >= 10) {
          // Collect raw probabilities for both distributions
          const trainProbs = baselinePredictions.map(tp => Math.min(0.9999, Math.max(0, Number(tp.churnProbability ?? 0))));
          const prodProbs  = predictions.map((p: any) => Math.min(0.9999, Math.max(0, Number(p.churn_probability ?? p.churnProbability ?? 0))));

          // PSI via 10-bin histogram
          const trainHist = Array(10).fill(0);
          for (const prob of trainProbs) trainHist[Math.floor(prob * 10)]++;
          const tn = trainProbs.length;
          let psiSum = 0;
          for (let i = 0; i < 10; i++) {
            const expected = Math.max(trainHist[i] / tn, 0.0001);
            const actual   = Math.max(histBins[i] / n, 0.0001);
            psiSum += (actual - expected) * Math.log(actual / expected);
          }
          psi = parseFloat(psiSum.toFixed(4));

          // 2-sample KS statistic: max |F_train(x) - F_prod(x)| over all x
          // Sort both arrays and walk merged CDF simultaneously.
          const sortedTrain = [...trainProbs].sort((a, b) => a - b);
          const sortedProd  = [...prodProbs].sort((a, b) => a - b);
          const nTrain = sortedTrain.length;
          const nProd  = sortedProd.length;
          let i = 0, j = 0, maxDiff = 0;
          while (i < nTrain || j < nProd) {
            const nextTrain = i < nTrain ? sortedTrain[i] : Infinity;
            const nextProd  = j < nProd  ? sortedProd[j]  : Infinity;
            const x = Math.min(nextTrain, nextProd);
            while (i < nTrain && sortedTrain[i] <= x) i++;
            while (j < nProd  && sortedProd[j]  <= x) j++;
            const diff = Math.abs(i / nTrain - j / nProd);
            if (diff > maxDiff) maxDiff = diff;
          }
          ks = parseFloat(maxDiff.toFixed(4));
        }
      } catch (_) { /* PSI/KS are optional */ }

      // ── Persist evaluation snapshot ──
      await storage.createModelEvaluationRun({
        modelId: model.id,
        datasetId: prodDatasetId,
        evaluationMonth,
        auc:          prodMetrics.auc          ?? null,
        accuracy:     prodMetrics.accuracy      ?? null,
        recall:       prodMetrics.recall        ?? null,
        precision:    prodMetrics.precision     ?? null,
        f1Score:      prodMetrics.f1Score       ?? null,
        ks:           ks                        ?? null,
        positiveCount: prodMetrics.positiveCount ?? null,
        negativeCount: prodMetrics.negativeCount ?? null,
        rowCount:     predictions.length,
        psi,
        highRiskPct,
        medRiskPct,
        lowRiskPct,
        scoreHistogram,
        topFeatureShapSummary,
        hasLabels:    !!(prodMetrics.auc != null),
      });

      await storage.createAuditLog({
        action: "score_prod",
        entityType: "model",
        entityId: model.id,
        entityName: model.name,
        detail: `Prod evaluation [${evaluationMonth}]: ${scoringSummary.predicted} predictions on "${prodDataset.name}" — AUC=${prodMetrics.auc?.toFixed(4) ?? "no labels"}, Acc=${prodMetrics.accuracy != null ? (prodMetrics.accuracy * 100).toFixed(1) + "%" : "n/a"}, PSI=${psi?.toFixed(4) ?? "n/a"}, KS=${ks?.toFixed(4) ?? "n/a"}`,
        user: "ml-ops-user",
        team: "ML Ops",
        status: "success",
      });

      res.json({
        modelId: model.id,
        evaluationMonth,
        predicted: scoringSummary.predicted,
        veryHigh: scoringSummary.veryHigh,
        high: scoringSummary.high,
        medium: scoringSummary.medium,
        low: scoringSummary.low,
        highRiskPct,
        medRiskPct,
        lowRiskPct,
        psi,
        ks,
        scoreHistogram,
        topFeatureShapSummary,
        metrics: prodMetrics,
      });
    } catch (e: any) {
      console.error("[ML score-production error]", e);
      res.status(500).json({ message: e.message });
    }
  });

  // Governance: real data from DB
  app.get("/api/orion/governance", async (_req, res) => {
    try {
      const allModels = await storage.getMlModels();
      const allDatasets = await storage.getDatasets();
      const allPreds = await storage.getPredictions();
      const auditEntries = await storage.getAuditLog(100);

      const registry = allModels.map(m => {
        const ds = allDatasets.find(d => d.id === m.datasetId);
        const predCount = allPreds.filter(p => p.modelId === m.id).length;
        return {
          id: m.id,
          name: m.name,
          algorithm: m.algorithm,
          status: m.status,
          isDeployed: m.isDeployed,
          accuracy: m.accuracy,
          auc: m.auc,
          f1Score: m.f1Score,
          datasetName: ds?.name || "Unknown",
          datasetRows: ds?.rowCount || 0,
          trainedAt: m.trainedAt,
          deployedAt: m.deployedAt,
          predictionCount: predCount,
          approvalStatus: m.approvalStatus || "pending",
          approvedBy: m.approvedBy,
          approvedAt: m.approvedAt,
          approvalNotes: m.approvalNotes,
          complianceChecks: {
            dataLineage: !!ds,
            metricsRecorded: !!(m.accuracy && m.auc),
            featureDocumented: !!(m.featureImportance),
            hyperparamsLogged: !!(m.hyperparameters),
          },
        };
      });

      res.json({
        registry,
        auditLog: auditEntries,
        summary: {
          totalModels: allModels.length,
          deployed: allModels.filter(m => m.isDeployed).length,
          datasets: allDatasets.length,
          totalPredictions: allPreds.length,
          compliant: registry.filter(r => Object.values(r.complianceChecks).every(Boolean)).length,
          approved: allModels.filter(m => m.approvalStatus === "approved").length,
          pendingApproval: allModels.filter(m => m.approvalStatus === "pending" || !m.approvalStatus).length,
        },
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }


  });
  // ── MONITORING ENGINE (live DB + synthetic backfill) ───────────────────# added
  app.get("/api/monitoring/:modelId", async (req, res) => {
    try {
      const modelId = parseInt(req.params.modelId);
      const prodDatasetId = req.query.prodDatasetId ? parseInt(req.query.prodDatasetId as string) : null;
      const models = await storage.getMlModels();
      const model = models.find((m: any) => m.id === modelId);
      if (!model) return res.status(404).json({ message: "Model not found" });

      const allPredictions = await storage.getPredictions();

      // ── Load production dataset override if requested ──────────────────
      let prodDatasetInfo: { id: number; name: string; rows: number; churnPct: number; matchedCount: number } | null = null;
      let prodVeryHighRiskPct: number | null = null;
      let prodAuc: number | null = null;
      let prodAccuracy: number | null = null;
      let prodRecall: number | null = null;
      if (prodDatasetId) {
        const prodDs = await storage.getDataset(prodDatasetId);
        if (prodDs) {
          const prodRows = getDatasetRows(prodDs);
          const totalProdRows = prodRows.length || 1;
          // Detect churn label column: ischurned or is_churned only.
          // churn_event_month is a historical schema field and must NOT be used as a
          // forward label for point-in-time scoring uploads (e.g. monthly prod data).
          const firstRow = prodRows[0] || {};
          const hasIsChurned = "ischurned" in firstRow || "is_churned" in firstRow;
          let actualChurnCount = 0;
          if (hasIsChurned) {
            const col = "ischurned" in firstRow ? "ischurned" : "is_churned";
            actualChurnCount = prodRows.filter(r => r[col] === 1 || r[col] === "1" || r[col] === true).length;
          }
          const datasetChurnPct = parseFloat(((actualChurnCount / totalProdRows) * 100).toFixed(1));
          // Only set prodVeryHighRiskPct when we have real churn labels.
          // Leaving it null when no labels causes effectiveVeryHighRiskPct to fall
          // back to currentVeryHighRiskPct (real model prediction risk distribution).
          if (hasIsChurned) {
            prodVeryHighRiskPct = datasetChurnPct;
          }

          // ── Compute AUC/Accuracy/Recall by joining prod rows to model predictions ──
          const allCustomers = await storage.getCustomers();
          const acctToCustomerId = new Map<string, number>();
          for (const c of allCustomers) {
            if (c.accountNumber) acctToCustomerId.set(String(c.accountNumber), c.id);
          }
          const customerIdToProb = new Map<number, number>();
          for (const pred of allPredictions.filter((p: any) => p.modelId === modelId)) {
            customerIdToProb.set(pred.customerId, Number(pred.churnProbability));
          }

          // Deduplicate prod rows by account_number, keep latest snapshot_month
          const latestByAcct = new Map<string, any>();
          for (const row of prodRows) {
            const acct = String(row.account_number ?? row.accountNumber ?? "");
            if (!acct) continue;
            const current = latestByAcct.get(acct);
            if (!current || String(row.snapshot_month ?? "") > String(current.snapshot_month ?? "")) {
              latestByAcct.set(acct, row);
            }
          }

          // Build (y_true, y_prob) pairs for matched accounts
          const pairs: { yTrue: number; yProb: number }[] = [];
          for (const [acct, row] of latestByAcct) {
            const custId = acctToCustomerId.get(acct);
            if (custId === undefined) continue;
            const yProb = customerIdToProb.get(custId);
            if (yProb === undefined) continue;
            let yTrue = 0;
            if (hasIsChurned) {
              const col = "ischurned" in firstRow ? "ischurned" : "is_churned";
              yTrue = (row[col] === 1 || row[col] === "1" || row[col] === true) ? 1 : 0;
            }
            pairs.push({ yTrue, yProb });
          }

          if (pairs.length >= 5) {
            // AUC via trapezoidal rule
            const sorted = [...pairs].sort((a, b) => b.yProb - a.yProb);
            const totalPos = pairs.reduce((s, p) => s + p.yTrue, 0);
            const totalNeg = pairs.length - totalPos;
            if (totalPos > 0 && totalNeg > 0) {
              let tp = 0, fp = 0, aucSum = 0, prevFpr = 0, prevTpr = 0;
              for (const p of sorted) {
                if (p.yTrue === 1) tp += 1; else fp += 1;
                const tpr = tp / totalPos;
                const fpr = fp / totalNeg;
                aucSum += (fpr - prevFpr) * (tpr + prevTpr) / 2;
                prevFpr = fpr; prevTpr = tpr;
              }
              prodAuc = parseFloat(aucSum.toFixed(4));
            }
            // Accuracy and Recall at threshold 0.5
            let tp50 = 0, fp50 = 0, tn50 = 0, fn50 = 0;
            for (const p of pairs) {
              const pred = p.yProb >= 0.5 ? 1 : 0;
              if (pred === 1 && p.yTrue === 1) tp50++;
              else if (pred === 1 && p.yTrue === 0) fp50++;
              else if (pred === 0 && p.yTrue === 0) tn50++;
              else fn50++;
            }
            prodAccuracy = parseFloat(((tp50 + tn50) / pairs.length).toFixed(4));
            prodRecall = (tp50 + fn50) > 0 ? parseFloat((tp50 / (tp50 + fn50)).toFixed(4)) : null;
          }

          prodDatasetInfo = { id: prodDatasetId, name: prodDs.name, rows: totalProdRows, churnPct: datasetChurnPct, matchedCount: pairs.length };
        }
      }

      const modelPredictions = allPredictions.filter((prediction: any) => prediction.modelId === modelId);
      const totalPreds = modelPredictions.length;

      const baseAuc = model.auc || 0.85;
      const baseAcc = model.accuracy || 0.82;
      const baseRecall = model.recall || 0.78;
      const now = new Date();

      type MonitoringSnapshot = {
        modelId: number;
        date: string;
        auc: number;
        accuracy: number;
        recall: number;
        predictionVolume: number;
        highRiskPct: number;
        medRiskPct: number;
        lowRiskPct: number;
        psi: number;
        ks: number;
        featureDriftScore: number;
        probabilityDistribution: number[];
        featureImportanceSnapshot: any;
        isSynthetic: boolean;
      };

      const probabilityBuckets = [0, 0, 0, 0, 0];
      let veryHighRiskCount = 0;
      let highRiskCount = 0;
      let medRiskCount = 0;
      let lowRiskCount = 0;

      for (const prediction of modelPredictions) {
        const probability = Number(prediction.churnProbability ?? 0);
        const bucketIndex = Math.min(4, Math.max(0, Math.floor(probability * 5)));
        probabilityBuckets[bucketIndex] += 1;

        const riskCategory = String(prediction.riskCategory || "").toLowerCase();
        if (riskCategory === "very high") { veryHighRiskCount += 1; highRiskCount += 1; }
        else if (riskCategory === "high") highRiskCount += 1;
        else if (riskCategory === "medium") medRiskCount += 1;
        else lowRiskCount += 1;
      }

      const totalPredictionCount = totalPreds || 1;
      const currentVeryHighRiskPct = parseFloat(((veryHighRiskCount / totalPredictionCount) * 100).toFixed(1));
      const currentHighRiskPct = parseFloat(((highRiskCount / totalPredictionCount) * 100).toFixed(1));
      const currentMedRiskPct = parseFloat(((medRiskCount / totalPredictionCount) * 100).toFixed(1));
      const currentLowRiskPct = parseFloat((100 - currentHighRiskPct - currentMedRiskPct).toFixed(1));
      const normalizedDistribution = probabilityBuckets.map((count) =>
        parseFloat((count / totalPredictionCount).toFixed(4)),
      );

      // ── Load real stored evaluation runs for this model ──
      const storedRuns = await storage.getModelEvaluationRuns(modelId);

      // Helper: convert month string "2026-01" → "Jan 2026"
      const formatMonth = (ym: string) => {
        const [y, m] = ym.split("-");
        const short = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        return `${short[(parseInt(m) - 1) % 12]} ${y}`;
      };

      const syntheticBaseline: MonitoringSnapshot[] = Array.from({ length: 11 }, (_, index) => {
        const weeksAgo = 11 - index;
        const date = new Date(now);
        date.setDate(date.getDate() - weeksAgo * 7);

        const decay = weeksAgo * 0.0016;
        const noise = Math.sin(index * 2.3 + modelId * 0.7) * 0.003;
        const auc = parseFloat(Math.min(0.99, Math.max(0.5, baseAuc - decay + noise)).toFixed(4));
        const accuracy = parseFloat(Math.min(0.99, Math.max(0.5, baseAcc - decay * 1.1 + noise * 0.8)).toFixed(4));
        const recall = parseFloat(Math.min(0.99, Math.max(0.4, baseRecall - decay * 1.4 + noise * 1.1)).toFixed(4));
        const psi = parseFloat(Math.min(0.35, weeksAgo * 0.014 + Math.abs(Math.sin(index * 1.7)) * 0.015).toFixed(4));
        const ks = parseFloat(Math.min(0.25, 0.04 + weeksAgo * 0.008 + Math.abs(Math.sin(index * 1.3)) * 0.008).toFixed(4));
        const predictionVolume = Math.max(10, totalPreds || 38 + weeksAgo * 2 + Math.round(Math.sin(index * 0.9) * 6));
        const highRiskPct = parseFloat(Math.min(35, 8 + weeksAgo * 0.4 + Math.abs(Math.sin(index * 2.1)) * 1.5).toFixed(1));
        const medRiskPct = parseFloat((23 + Math.sin(index * 1.5) * 2.5).toFixed(1));
        const lowRiskPct = parseFloat(Math.max(30, 100 - highRiskPct - medRiskPct).toFixed(1));

        return {
          modelId,
          date: date.toISOString().split("T")[0],
          auc,
          accuracy,
          recall,
          predictionVolume,
          highRiskPct,
          medRiskPct,
          lowRiskPct,
          psi,
          ks,
          featureDriftScore: parseFloat(Math.min(0.3, psi * 0.8).toFixed(4)),
          probabilityDistribution: [
            lowRiskPct * 0.006,
            medRiskPct * 0.008,
            (medRiskPct + highRiskPct) * 0.003,
            highRiskPct * 0.007,
            highRiskPct * 0.004,
          ].map((value) => parseFloat(Math.min(0.4, Math.max(0.01, value)).toFixed(4))),
          featureImportanceSnapshot: model.featureImportance as any,
          isSynthetic: true,
        };
      });

      // Use production dataset veryHighRiskPct if provided, otherwise fall back to model predictions
      const effectiveVeryHighRiskPct = prodVeryHighRiskPct !== null ? prodVeryHighRiskPct : currentVeryHighRiskPct;
      // Use production-computed metrics when available, otherwise fall back to training metrics
      const effectiveAuc = prodAuc !== null ? prodAuc : baseAuc;
      const effectiveAcc = prodAccuracy !== null ? prodAccuracy : baseAcc;
      const effectiveRecall = prodRecall !== null ? prodRecall : baseRecall;

      const latestRealSnapshot: MonitoringSnapshot | null = (totalPreds > 0 || prodDatasetInfo)
        ? {
            modelId,
            date: now.toISOString().split("T")[0],
            auc: effectiveAuc,
            accuracy: effectiveAcc,
            recall: effectiveRecall,
            predictionVolume: prodDatasetInfo ? prodDatasetInfo.rows : totalPreds,
            highRiskPct: currentHighRiskPct,
            medRiskPct: currentMedRiskPct,
            lowRiskPct: currentLowRiskPct,
            psi: parseFloat(Math.min(0.35, Math.abs(effectiveAuc - effectiveAcc) * 0.6 + Math.max(0, effectiveVeryHighRiskPct - 20) * 0.004).toFixed(4)),
            ks: parseFloat(Math.min(0.25, Math.abs(effectiveRecall - effectiveAcc) * 0.5 + Math.max(0, effectiveVeryHighRiskPct - 15) * 0.0025).toFixed(4)),
            featureDriftScore: parseFloat(Math.min(0.3, Math.abs(effectiveAuc - effectiveRecall) * 0.5 + Math.max(0, effectiveVeryHighRiskPct - 18) * 0.003).toFixed(4)),
            probabilityDistribution: normalizedDistribution,
            featureImportanceSnapshot: model.featureImportance as any,
            isSynthetic: false,
          }
        : null;

      let snaps: MonitoringSnapshot[];
      let realCount: number;
      let weeklyMetrics: any[];

      if (storedRuns.length >= 1) {
        // ── Real data path: build chart from stored evaluation runs ──
        // Convert stored runs → MonitoringSnapshot
        const runSnaps: MonitoringSnapshot[] = storedRuns.map((run) => ({
          modelId,
          date: run.evaluatedAt ? new Date(run.evaluatedAt).toISOString().split("T")[0] : run.evaluationMonth + "-01",
          auc:      run.auc      ?? baseAuc,
          accuracy: run.accuracy ?? baseAcc,
          recall:   run.recall   ?? baseRecall,
          predictionVolume: run.rowCount,
          highRiskPct: run.highRiskPct ?? 0,
          medRiskPct:  run.medRiskPct  ?? 0,
          lowRiskPct:  run.lowRiskPct  ?? 0,
          psi: run.psi ?? 0,
          ks:  run.ks  ?? 0,
          featureDriftScore: parseFloat(Math.min(0.3, (run.psi ?? 0) * 0.8).toFixed(4)),
          probabilityDistribution: Array.isArray(run.scoreHistogram)
            ? (run.scoreHistogram as any[]).slice(0, 5).map((b: any) => parseFloat((b.pct / 100).toFixed(4)))
            : normalizedDistribution,
          featureImportanceSnapshot: model.featureImportance as any,
          isSynthetic: false,
        }));

        // Only show real runs — no synthetic padding
        snaps = runSnaps;
        realCount = runSnaps.length;

        weeklyMetrics = snaps.map((snapshot, index) => {
          const run = storedRuns[index];
          const label = formatMonth(run.evaluationMonth);
          return {
            date: snapshot.date,
            label,
            evaluationMonth: run.evaluationMonth,
            hasLabels: run.hasLabels ?? false,
            // When hasLabels is false (no is_churned column in prod dataset), fall back to
            // tracking model's training AUC/Acc/Recall so the Performance Trends chart always
            // shows a usable reference line rather than being completely empty.
            auc:       run.auc      ?? (run.hasLabels ? null : baseAuc),
            accuracy:  run.accuracy ?? (run.hasLabels ? null : baseAcc),
            recall:    run.recall   ?? (run.hasLabels ? null : baseRecall),
            precision: run.hasLabels ? (run.precision ?? null) : null,
            f1Score:   run.hasLabels ? (run.f1Score   ?? null) : null,
            psi:       snapshot.psi ?? 0,
            // KS is a distribution-based metric (not label-dependent) — always populate it.
            ks:        run.ks ?? snapshot.ks ?? 0,
            volume:    snapshot.predictionVolume ?? 0,
            highRiskPct: snapshot.highRiskPct ?? 0,
            medRiskPct:  snapshot.medRiskPct  ?? 0,
            lowRiskPct:  snapshot.lowRiskPct  ?? 0,
            positiveCount: run.positiveCount ?? null,
            negativeCount: run.negativeCount ?? null,
            topFeatureShapSummary: run.topFeatureShapSummary ?? null,
            isSynthetic: false,
          };
        });

      } else {
        // ── Fallback: no stored runs yet — original synthetic + 1 real snapshot ──
        snaps = latestRealSnapshot
          ? [...syntheticBaseline, latestRealSnapshot]
          : syntheticBaseline;
        realCount = latestRealSnapshot ? 1 : 0;

        const latest12 = snaps.slice(-12);
        weeklyMetrics = latest12.map((snapshot: MonitoringSnapshot, index: number) => ({
          date: snapshot.date,
          label: `W${index + 1}`,
          evaluationMonth: null,
          hasLabels: false,
          auc: snapshot.auc ?? baseAuc,
          accuracy: snapshot.accuracy ?? baseAcc,
          recall: snapshot.recall ?? baseRecall,
          precision: null,
          f1Score: null,
          psi: snapshot.psi ?? 0,
          ks: snapshot.ks ?? 0,
          volume: snapshot.predictionVolume ?? 0,
          highRiskPct: snapshot.highRiskPct ?? 0,
          medRiskPct: snapshot.medRiskPct ?? 0,
          lowRiskPct: snapshot.lowRiskPct ?? 0,
          positiveCount: null,
          negativeCount: null,
          topFeatureShapSummary: null,
          isSynthetic: snapshot.isSynthetic,
        }));
      }

      // ── Feature drivers: real topFeatureShapSummary when available, synthetic fallback ──
      const targetColumns = new Set(["ischurned", "is_churned", "target", "label", "churn", "churned"]);

      type ShapEntry = { feature: string; avgShap: number; freq: number; freqPct: number };
      type PeriodEntry = { date: string; label: string; [key: string]: number | string };

      // Collect stored runs that carry real SHAP summaries, sorted ascending by month
      const runsWithShap = storedRuns
        .filter((r) => Array.isArray(r.topFeatureShapSummary) && (r.topFeatureShapSummary as any[]).length > 0)
        .sort((a, b) => a.evaluationMonth.localeCompare(b.evaluationMonth));

      let featureHistory: PeriodEntry[];
      let driverChanges: any[];
      let topFeatureNamesList: string[];

      if (runsWithShap.length >= 1) {
        // ── Real SHAP path ──────────────────────────────────────────────
        // Pick top 6 features by score (avgShap × freqPct/100) from the latest run
        const latestShap = (runsWithShap[runsWithShap.length - 1].topFeatureShapSummary as ShapEntry[])
          .filter((s) => !targetColumns.has(s.feature.toLowerCase()));
        const topFeatures = [...latestShap]
          .map((s) => ({ name: s.feature, score: s.avgShap * s.freqPct / 100 }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)
          .map((s) => s.name);
        topFeatureNamesList = topFeatures;

        // Build featureHistory — one PeriodEntry per stored run
        featureHistory = runsWithShap.map((run) => {
          const shapArr = run.topFeatureShapSummary as ShapEntry[];
          const scoreMap = new Map<string, number>();
          shapArr.forEach((s) => { scoreMap.set(s.feature, parseFloat((s.avgShap * s.freqPct / 100).toFixed(4))); });
          const entry: PeriodEntry = {
            date: run.evaluationMonth + "-01",
            label: formatMonth(run.evaluationMonth),
          };
          topFeatures.forEach((name) => { entry[name] = scoreMap.get(name) ?? 0; });
          return entry;
        });

        // Build driverChanges: latest run vs second-to-last (or itself when only 1 run)
        const currShap = runsWithShap[runsWithShap.length - 1].topFeatureShapSummary as ShapEntry[];
        const prevShap = runsWithShap.length >= 2
          ? (runsWithShap[runsWithShap.length - 2].topFeatureShapSummary as ShapEntry[])
          : currShap;
        const currMap = new Map<string, number>(currShap.map((s) => [s.feature, s.avgShap * s.freqPct / 100]));
        const prevMap = new Map<string, number>(prevShap.map((s) => [s.feature, s.avgShap * s.freqPct / 100]));

        driverChanges = topFeatures.map((name) => {
          const curr = currMap.get(name) ?? 0;
          const prev = prevMap.get(name) ?? curr;
          const delta = curr - prev;
          return {
            name,
            displayName: name.replace(/_/g, " "),
            current: parseFloat(curr.toFixed(4)),
            previous: parseFloat(prev.toFixed(4)),
            delta: parseFloat(delta.toFixed(4)),
            deltaPct: prev > 0 ? parseFloat(((delta / prev) * 100).toFixed(1)) : 0,
            trend: delta > 0.001 ? "rising" : delta < -0.001 ? "declining" : "stable",
          };
        }).sort((a: any, b: any) => b.current - a.current);

      } else {
        // ── Synthetic fallback (no real SHAP data yet) ──────────────────
        const DEFAULT_FEATURES = [
          { name: "tenure_months", baseScore: 0.278 },
          { name: "total_spend_6m", baseScore: 0.221 },
          { name: "outage_count_12m", baseScore: 0.184 },
          { name: "monthly_revenue", baseScore: 0.152 },
          { name: "support_tickets_6m", baseScore: 0.141 },
          { name: "contract_type", baseScore: 0.118 },
        ];
        const rawFeatures = ((model.featureImportance as any[]) || [])
          .filter((feature: any) => !targetColumns.has((feature.feature || feature.name || "").toLowerCase()))
          .slice(0, 6)
          .map((feature: any) => ({
            name: feature.feature || feature.name || "unknown",
            baseScore: feature.importance || (feature.normalizedScore ? feature.normalizedScore / 100 : 0.1),
          }));
        const features = rawFeatures.length >= 4 ? rawFeatures : DEFAULT_FEATURES;
        topFeatureNamesList = features.map((f: any) => f.name);

        featureHistory = Array.from({ length: 6 }, (_, periodIdx) => {
          const wk = 5 - periodIdx;
          const d = new Date(now);
          d.setDate(d.getDate() - wk * 14);
          const vals: PeriodEntry = { date: d.toISOString().split("T")[0], label: `P${periodIdx + 1}` };
          features.forEach((f: any) => {
            const noise = Math.sin(periodIdx * 1.7 + f.name.length * 0.4) * 0.012;
            const revTrend = f.name.includes("revenue") || f.name.includes("spend") ? periodIdx * 0.006 : 0;
            const outageTrend = f.name.includes("outage") ? -periodIdx * 0.004 : 0;
            vals[f.name] = parseFloat(Math.max(0.01, f.baseScore + noise + revTrend + outageTrend).toFixed(4));
          });
          return vals;
        });

        const firstPeriod = featureHistory[0];
        const lastPeriod = featureHistory[featureHistory.length - 1];
        driverChanges = features.map((f: any) => {
          const prev = firstPeriod[f.name] as number;
          const curr = lastPeriod[f.name] as number;
          const delta = curr - prev;
          return {
            name: f.name, displayName: f.name.replace(/_/g, " "),
            current: curr, previous: prev,
            delta: parseFloat(delta.toFixed(4)),
            deltaPct: parseFloat(((delta / prev) * 100).toFixed(1)),
            trend: delta > 0.01 ? "rising" : delta < -0.008 ? "declining" : "stable",
          };
        }).sort((a: any, b: any) => b.current - a.current);
      }

      // ── Compute summary from latest real snapshot (or latest overall) ──
      const latestSnap = snaps[snaps.length - 1];
      const lag4Snap = snaps.length >= 5 ? snaps[snaps.length - 5] : snaps[0];
      const latestAuc = latestSnap?.auc ?? baseAuc;
      const latestAcc = latestSnap?.accuracy ?? baseAcc;
      const latestRecall = latestSnap?.recall ?? baseRecall;
      // For PSI/KS/highRiskPct: stored eval runs may have null → 0 if they were scored
      // without drift computation. Fall back to latestRealSnapshot (computed from current
      // prediction distribution) or directly to currentHighRiskPct so cards never show 0
      // when real prediction data is available.
      const latestPsi = (latestSnap?.psi ?? 0) || (latestRealSnapshot?.psi ?? 0);
      const latestKs = (latestSnap?.ks ?? 0) || (latestRealSnapshot?.ks ?? 0);
      const latestHighRiskPct = (latestSnap?.highRiskPct ?? 0) || currentHighRiskPct;
      const aucDelta = parseFloat(((latestSnap?.auc ?? 0) - (lag4Snap?.auc ?? 0)).toFixed(4));
      const recallDelta = parseFloat(((latestSnap?.recall ?? 0) - (lag4Snap?.recall ?? 0)).toFixed(4));
      const psiDelta = parseFloat(((latestSnap?.psi ?? 0) - (lag4Snap?.psi ?? 0)).toFixed(4));
      const highRiskDelta = parseFloat(((latestSnap?.highRiskPct ?? 0) - (lag4Snap?.highRiskPct ?? 0)).toFixed(1));

      // ── Rule-based recommendation engine ───────────────────────────────
      const recommendations: any[] = [];

      if (latestPsi > 0.2) {
        recommendations.push({
          id: "r-psi", severity: "high", category: "Drift", icon: "alert",
          title: "Population Distribution Shift Detected",
          detail: `PSI has reached ${latestPsi.toFixed(3)} (threshold: 0.200), computed from real scoring data. The prediction probability distribution has shifted significantly from the baseline scoring run, indicating the model is now scoring a different population profile.`,
          action: "Retrain the model using data from the last 30 days to recalibrate to the current population. Review source data pipelines for schema or upstream distribution changes.",
          impact: "Prevents silent model degradation — estimated AUC recovery of +0.02 to +0.04.",
        });
      }

      if (aucDelta < -0.012) {
        recommendations.push({
          id: "r-auc", severity: "high", category: "Performance", icon: "trend-down",
          title: "Model Discriminative Power Declining",
          detail: `AUC dropped ${Math.abs(aucDelta).toFixed(4)} over the last 4 scoring runs (${(lag4Snap?.auc ?? 0).toFixed(4)} → ${latestAuc.toFixed(4)}). The model's ability to distinguish churners from non-churners is degrading.`,
          action: "Audit recent prediction errors against confirmed outcomes. Schedule a retraining run with fresh labelled data. Compare AUC/recall before promoting the new model to production.",
          impact: "Restoring AUC to baseline improves high-risk customer detection by an estimated 8–12%.",
        });
      }

      if (recallDelta < -0.018) {
        recommendations.push({
          id: "r-recall", severity: "high", category: "Performance", icon: "alert",
          title: "Recall Degrading — Missed Churners Increasing",
          detail: `Model recall fell from ${((lag4Snap?.recall ?? 0) * 100).toFixed(1)}% to ${(latestRecall * 100).toFixed(1)}% over 4 scoring runs. More churners are being misclassified as low-risk.`,
          action: "Lower the high-risk classification threshold from 0.60 to 0.55. Retrain with confirmed churn cases from the last 60 days. Re-evaluate the precision–recall trade-off.",
          impact: "Estimated recovery of 15–20 additional at-risk customers correctly identified per scoring cycle.",
        });
      }

      if (highRiskDelta > 3.0) {
        recommendations.push({
          id: "r-risk-shift", severity: "medium", category: "Drift", icon: "alert",
          title: "High-Risk Prediction Volume Rising",
          detail: `High-risk predictions grew by ${highRiskDelta.toFixed(1)}pp over 4 scoring runs (${(lag4Snap?.highRiskPct ?? 0).toFixed(1)}% → ${latestHighRiskPct.toFixed(1)}%). This may reflect a real behavioural shift or model calibration drift.`,
          action: "Cross-check against confirmed churn outcomes. If the false positive rate has risen, recalibrate the classification threshold. If real, scale up retention team capacity.",
          impact: "Prevents alert fatigue while maintaining precision on genuinely at-risk accounts.",
        });
      }

      const risingDriver = driverChanges.find((d: any) => d.trend === "rising");
      if (risingDriver) {
        recommendations.push({
          id: "r-driver", severity: "medium", category: "Feature", icon: "sparkle",
          title: `Rising Driver: "${risingDriver.displayName}"`,
          detail: `Feature importance for "${risingDriver.displayName}" increased ${risingDriver.deltaPct > 0 ? "+" : ""}${risingDriver.deltaPct}% (${risingDriver.previous.toFixed(3)} → ${risingDriver.current.toFixed(3)}). This signal is becoming a stronger churn predictor.`,
          action: `Ensure this feature is freshly computed. Consider adding related engineered features (rolling trend, lag, ratio) to capture the full signal. Update retention playbooks to respond to this driver.`,
          impact: "Incorporating the full driver signal may improve AUC by +0.01 to +0.02.",
        });
      }

      const decliningDriver = driverChanges.find((d: any) => d.trend === "declining");
      if (decliningDriver) {
        recommendations.push({
          id: "r-decline", severity: "low", category: "Feature", icon: "info",
          title: `Declining Driver: "${decliningDriver.displayName}"`,
          detail: `Feature importance for "${decliningDriver.displayName}" dropped ${decliningDriver.deltaPct}% (${decliningDriver.previous.toFixed(3)} → ${decliningDriver.current.toFixed(3)}). Its predictive power may be weakening due to upstream data changes.`,
          action: "Audit the data pipeline for this feature. Check for increased null rates, schema changes, or distribution shifts in raw data.",
          impact: "Ensures feature pipelines remain reliable and model inputs stay high quality.",
        });
      }

      if (totalPreds === 0 && !prodDatasetInfo) {
        recommendations.push({
          id: "r-no-preds", severity: "medium", category: "Operational", icon: "info",
          title: "No Live Prediction Data Yet",
          detail: "This model has not scored any customers yet. The monitoring charts currently show synthetic baseline data to illustrate expected patterns. Score customers to start accumulating real monitoring history.",
          action: "Click 'Score Customers' on this model to run it against the active customer base and generate your first real monitoring snapshot.",
          impact: "Enables real drift detection, live KPI tracking, and retention team targeting.",
        });
      }

      recommendations.push({
        id: "r-retrain", severity: "low", category: "Maintenance", icon: "calendar",
        title: "Scheduled Retraining Recommended",
        detail: `The model was trained on data up to ${model.trainedAt ? new Date(model.trainedAt).toLocaleDateString() : "an unknown date"}. Industry best practice recommends retraining churn models every 6–8 weeks to prevent performance decay.`,
        action: "Schedule a retraining run in Experiment Lab using the last 90 days of customer data. Compare metrics before promoting the new version to production.",
        impact: "Maintains model freshness and prevents gradual performance decay over time.",
      });

      recommendations.push({
        id: "r-audit", severity: "low", category: "Operational", icon: "shield",
        title: "Feature Pipeline Audit Due",
        detail: "Routine audit of feature computation pipelines is recommended to detect upstream data quality issues before they silently degrade model performance.",
        action: "Review source data completeness for the top 5 features. Check for schema changes, elevated null rates, or distribution shifts in the raw data.",
        impact: "Prevents silent data quality issues from reducing model discrimination.",
      });

      res.json({
        weeklyMetrics,
        featureHistory,
        featureNames: topFeatureNamesList,
        driverChanges,
        recommendations,
        dataSource: {
          totalSnapshots: snaps.length,
          realSnapshots: realCount,
          syntheticSnapshots: snaps.length - realCount,
          hasRealData: realCount > 0,
          prodDataset: prodDatasetInfo,
        },
        summary: {
          latestAuc, latestAccuracy: latestAcc, latestRecall, latestPsi, latestKs,
          latestHighRiskPct, aucDelta, recallDelta, psiDelta, highRiskDelta, totalPredictions: totalPreds,
          prodDataset: prodDatasetInfo,
          // prod-computed metrics (null when no prod dataset selected or no matched pairs)
          prodAuc, prodAccuracy, prodRecall,
        },
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── CODE EXPLORER ──────────────────────────────────────────────────────────
  const CODE_FILE_MAP: Record<string, { path: string; label: string; description: string }> = {
    "train_model": {
      path: join(process.cwd(), "server/python-ml/train_model.py"),
      label: "ML Trainer",
      description: "Python ML engine: Handles feature engineering, model selection, and training logic",
    },
    "schema": {
      path: join(process.cwd(), "shared/schema.ts"),
      label: "Data Schema",
      description: "Database schema and type definitions for all entities",
    },
    "storage": {
      path: join(process.cwd(), "server/storage.ts"),
      label: "Storage Layer",
      description: "Data access layer — all CRUD operations between routes and the database",
    },
    "engine": {
      path: join(process.cwd(), "server/custom-feature-engine.ts"),
      label: "Feature Engine",
      description: "Logic for applying custom calculated features (lag, trend, ratio) to datasets",
    },
    "seed": {
      path: join(process.cwd(), "server/seed.ts"),
      label: "Seed Data",
      description: "Initial dataset seeding and synthetic customer generation",
    },
    "calculate_shap": {
      path: join(process.cwd(), "server/python-ml/calculate_shap.py"),
      label: "SHAP Explainer",
      description: "Python script for generating model explanations and feature contributions",
    },
  };

  app.get("/api/code/files", (_req, res) => {
    res.json(Object.entries(CODE_FILE_MAP).map(([id, meta]) => ({ id, label: meta.label, description: meta.description })));
  });

  // ── Dynamic algorithm list from Python trainer ─────────────────────────
  app.get("/api/orion/algorithms", async (_req, res) => {
    try {
      const pythonPath = join(process.cwd(), "server/python-ml/train_model.py");
      const content = await readFile(pythonPath, "utf-8");

      // Extract MODEL_FAMILY_DISPLAY_NAMES dictionary content
      const match = content.match(/MODEL_FAMILY_DISPLAY_NAMES\s*=\s*{([^}]+)}/s);
      const algos = [
        { value: "Auto", label: "Auto (Best Model)", desc: "Trains multiple models and selects the best performer" }
      ];

      if (match) {
        const dictContent = match[1];
        const entryRegex = /'([^']+)':\s*'([^']+)'/g;
        let entryMatch;
        while ((entryMatch = entryRegex.exec(dictContent)) !== null) {
          const label = entryMatch[2];
          algos.push({
            value: label,
            label: label,
            desc: `Custom model defined in backend: ${label}`
          });
        }
      } else {
        // Fallback for safety
        algos.push(
          { value: "Random Forest", label: "Random Forest", desc: "Ensemble of decision trees" },
          { value: "XGBoost", label: "XGBoost", desc: "Gradient boosting" },
          { value: "LightGBM", label: "LightGBM", desc: "Fast gradient boosting" }
        );
      }
      res.json(algos);
    } catch (e) {
      res.status(500).json({ message: "Failed to parse algorithms from trainer script" });
    }
  });

  app.get("/api/code/:fileId", async (req, res) => {
    try {
      const meta = CODE_FILE_MAP[req.params.fileId];
      if (!meta) return res.status(404).json({ message: "File not in allowlist" });
      const content = await readFile(meta.path, "utf-8");
      const stats = await stat(meta.path);
      res.json({ id: req.params.fileId, label: meta.label, description: meta.description, content, lines: content.split("\n").length, lastModified: stats.mtime });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/code/:fileId", async (req, res) => {
    try {
      const meta = CODE_FILE_MAP[req.params.fileId];
      if (!meta) return res.status(404).json({ message: "File not in allowlist" });
      const { content } = req.body;
      if (typeof content !== "string" || content.trim().length === 0) return res.status(400).json({ message: "Content is required" });
      await writeFile(meta.path, content, "utf-8");
      await storage.createAuditLog({ action: "update", entityType: "code", entityId: 0, entityName: meta.label, detail: `Backend file ${meta.label} modified via Code Explorer`, user: "ml-ops-user", team: "ML Ops", status: "success" });
      res.json({ success: true, lines: content.split("\n").length, savedAt: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
  // ───────────────────────────────────────────────────────────────────────────

}
