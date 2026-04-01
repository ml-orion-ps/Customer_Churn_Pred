import { db } from "./db";
import { eq, desc, sql, and, count, inArray } from "drizzle-orm";
import {
  customers, churnEvents, datasets, mlModels, predictions, recommendations, auditLog,
  type InsertCustomer, type Customer,
  type InsertChurnEvent, type ChurnEvent,
  type InsertDataset, type Dataset,
  type InsertMlModel, type MlModel,
  type InsertPrediction, type Prediction,
  type InsertRecommendation, type Recommendation,
  type InsertAuditLog, type AuditLogEntry,
} from "@shared/schema";

export interface IStorage {
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  createCustomer(data: InsertCustomer): Promise<Customer>;
  upsertCustomer(data: InsertCustomer): Promise<Customer>;
  getChurnEvents(): Promise<ChurnEvent[]>;
  createChurnEvent(data: InsertChurnEvent): Promise<ChurnEvent>;
  getDatasets(): Promise<Dataset[]>;
  getDataset(id: number): Promise<Dataset | undefined>;
  createDataset(data: InsertDataset): Promise<Dataset>;
  updateDataset(id: number, data: Partial<Dataset>): Promise<Dataset>;
  deleteDataset(id: number): Promise<void>;
  getMlModels(): Promise<MlModel[]>;
  getMlModel(id: number): Promise<MlModel | undefined>;
  createMlModel(data: InsertMlModel): Promise<MlModel>;
  updateMlModel(id: number, data: Partial<MlModel>): Promise<MlModel>;
  deleteMlModel(id: number): Promise<void>;
  getPredictions(modelId?: number): Promise<Prediction[]>;
  clearPredictionsByModel(modelId: number): Promise<void>;
  clearAllPredictions(): Promise<void>;
  createPrediction(data: InsertPrediction): Promise<Prediction>;
  getRecommendations(customerId?: number): Promise<Recommendation[]>;
  createRecommendation(data: InsertRecommendation): Promise<Recommendation>;
  updateRecommendation(id: number, data: Partial<Recommendation>): Promise<Recommendation>;
  getAuditLog(limit?: number): Promise<AuditLogEntry[]>;
  createAuditLog(data: InsertAuditLog): Promise<AuditLogEntry>;
  getChurnAnalytics(): Promise<any>;
  getSegmentAnalytics(): Promise<any>;
  getCustomerCount(): Promise<number>;
  getCommandCenterData(): Promise<any>;
  getChurnDiagnostics(): Promise<any>;
  getRiskIntelligence(): Promise<any>;
  getRetentionData(): Promise<any>;
  getBusinessImpact(): Promise<any>;
  getStrategyInsights(): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  async getCustomers(): Promise<Customer[]> {
    return db.select().from(customers).orderBy(desc(customers.churnRiskScore));
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async createCustomer(data: InsertCustomer): Promise<Customer> {
    const [customer] = await db.insert(customers).values(data).returning();
    return customer;
  }

  async upsertCustomer(data: InsertCustomer): Promise<Customer> {
    const [customer] = await db
      .insert(customers)
      .values(data)
      .onConflictDoUpdate({
        target: customers.accountNumber,
        set: {
          region: data.region,
          serviceType: data.serviceType,
          tenureMonths: data.tenureMonths,
          monthlyRevenue: data.monthlyRevenue,
          contractStatus: data.contractStatus,
          valueTier: data.valueTier,
          provisionedSpeed: data.provisionedSpeed,
          actualSpeed: data.actualSpeed,
          outageCount: data.outageCount,
          ticketCount: data.ticketCount,
          avgResolutionHours: data.avgResolutionHours,
          npsScore: data.npsScore,
          fiberAvailable: data.fiberAvailable,
          competitorAvailable: data.competitorAvailable,
          isChurned: data.isChurned,
          churnReason: data.churnReason,
          lastBillAmount: data.lastBillAmount,
          premisesType: data.premisesType,
          lifecycleStage: data.lifecycleStage,
        },
      })
      .returning();
    return customer;
  }

  async getChurnEvents(): Promise<ChurnEvent[]> {
    return db.select().from(churnEvents).orderBy(desc(churnEvents.churnDate));
  }

  async createChurnEvent(data: InsertChurnEvent): Promise<ChurnEvent> {
    const [event] = await db.insert(churnEvents).values(data).returning();
    return event;
  }

  async getDatasets(): Promise<Dataset[]> {
    return db.select().from(datasets).orderBy(desc(datasets.uploadedAt));
  }

  async getDataset(id: number): Promise<Dataset | undefined> {
    const [dataset] = await db.select().from(datasets).where(eq(datasets.id, id));
    return dataset;
  }

  async createDataset(data: InsertDataset): Promise<Dataset> {
    const [dataset] = await db.insert(datasets).values(data).returning();
    return dataset;
  }

  async updateDataset(id: number, data: Partial<Dataset>): Promise<Dataset> {
    const [dataset] = await db.update(datasets).set(data).where(eq(datasets.id, id)).returning();
    return dataset;
  }

  async deleteDataset(id: number): Promise<void> {
    await db.delete(datasets).where(eq(datasets.id, id));
  }

  async getMlModels(): Promise<MlModel[]> {
    return db.select().from(mlModels).orderBy(desc(mlModels.trainedAt));
  }

  async getMlModel(id: number): Promise<MlModel | undefined> {
    const [model] = await db.select().from(mlModels).where(eq(mlModels.id, id));
    return model;
  }

  async createMlModel(data: InsertMlModel): Promise<MlModel> {
    const [model] = await db.insert(mlModels).values(data).returning();
    return model;
  }

  async updateMlModel(id: number, data: Partial<MlModel>): Promise<MlModel> {
    const [model] = await db.update(mlModels).set(data).where(eq(mlModels.id, id)).returning();
    return model;
  }

  async deleteMlModel(id: number): Promise<void> {
    await db.delete(predictions).where(eq(predictions.modelId, id));
    await db.delete(mlModels).where(eq(mlModels.id, id));
  }

  async getPredictions(modelId?: number): Promise<Prediction[]> {
    if (modelId) {
      return db
        .select({
          id: predictions.id,
          modelId: predictions.modelId,
          customerId: predictions.customerId,
          churnProbability: predictions.churnProbability,
          riskCategory: predictions.riskCategory,
          topDrivers: predictions.topDrivers,
          recommendedAction: predictions.recommendedAction,
          actionCategory: predictions.actionCategory,
          predictedAt: predictions.predictedAt,
          accountNumber: customers.accountNumber,
        })
        .from(predictions)
        .innerJoin(customers, eq(predictions.customerId, customers.id))
        .where(eq(predictions.modelId, modelId))
        .orderBy(desc(predictions.predictedAt));
    }
    return db
      .select({
        id: predictions.id,
        modelId: predictions.modelId,
        customerId: predictions.customerId,
        churnProbability: predictions.churnProbability,
        riskCategory: predictions.riskCategory,
        topDrivers: predictions.topDrivers,
        recommendedAction: predictions.recommendedAction,
        actionCategory: predictions.actionCategory,
        predictedAt: predictions.predictedAt,
        accountNumber: customers.accountNumber,
      })
      .from(predictions)
      .innerJoin(customers, eq(predictions.customerId, customers.id))
      .orderBy(desc(predictions.predictedAt));
  }

  async clearPredictionsByModel(modelId: number): Promise<void> {
    const modelPredictionIds = await db
      .select({ id: predictions.id })
      .from(predictions)
      .where(eq(predictions.modelId, modelId));

    if (modelPredictionIds.length > 0) {
      await db
        .delete(recommendations)
        .where(inArray(recommendations.predictionId, modelPredictionIds.map((p) => p.id)));
    }

    await db.delete(predictions).where(eq(predictions.modelId, modelId));
  }

  async clearAllPredictions(): Promise<void> {
    const allPredictionIds = await db.select({ id: predictions.id }).from(predictions);

    if (allPredictionIds.length > 0) {
      await db
        .delete(recommendations)
        .where(inArray(recommendations.predictionId, allPredictionIds.map((p) => p.id)));
    }

    await db.delete(predictions);
  }

  async createPrediction(data: InsertPrediction): Promise<Prediction> {
    const [prediction] = await db.insert(predictions).values(data).returning();
    return prediction;
  }

  async getRecommendations(customerId?: number): Promise<Recommendation[]> {
    if (customerId) {
      return db.select().from(recommendations).where(eq(recommendations.customerId, customerId));
    }
    return db.select().from(recommendations).orderBy(desc(recommendations.createdAt));
  }

  async createRecommendation(data: InsertRecommendation): Promise<Recommendation> {
    const [rec] = await db.insert(recommendations).values(data).returning();
    return rec;
  }

  async updateRecommendation(id: number, data: Partial<Recommendation>): Promise<Recommendation> {
    const [rec] = await db.update(recommendations).set(data).where(eq(recommendations.id, id)).returning();
    return rec;
  }

  async getAuditLog(limit = 200): Promise<AuditLogEntry[]> {
    return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
  }

  async createAuditLog(data: InsertAuditLog): Promise<AuditLogEntry> {
    const [entry] = await db.insert(auditLog).values(data).returning();
    return entry;
  }

  async getCustomerCount(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(customers);
    return result.count;
  }

  async getChurnAnalytics(): Promise<any> {
    const totalCustomers = await db.select({ count: count() }).from(customers);
    const churnedCustomers = await db.select({ count: count() }).from(customers).where(eq(customers.isChurned, true));
    const activeCustomers = await db.select({ count: count() }).from(customers).where(eq(customers.isChurned, false));

    const avgRevenue = await db.select({
      avg: sql<number>`avg(${customers.monthlyRevenue})`,
      total: sql<number>`sum(${customers.monthlyRevenue})`,
    }).from(customers).where(eq(customers.isChurned, false));

    const revenueAtRisk = await db.select({
      total: sql<number>`sum(${customers.monthlyRevenue})`,
    }).from(customers).where(and(eq(customers.isChurned, false), sql`${customers.churnRiskScore} > 0.6`));

    const riskDistribution = await db.select({
      category: customers.churnRiskCategory,
      count: count(),
    }).from(customers).where(eq(customers.isChurned, false)).groupBy(customers.churnRiskCategory);

    const regionChurn = await db.select({
      region: customers.region,
      total: count(),
      churned: sql<number>`sum(case when ${customers.isChurned} = true then 1 else 0 end)`,
    }).from(customers).groupBy(customers.region);

    const churnByReason = await db.select({
      reason: customers.churnReason,
      count: count(),
    }).from(customers).where(eq(customers.isChurned, true)).groupBy(customers.churnReason);

    const churnByTenure = await db.select({
      bucket: sql<string>`case 
        when ${customers.tenureMonths} < 12 then '0-12 months'
        when ${customers.tenureMonths} < 24 then '12-24 months'
        when ${customers.tenureMonths} < 48 then '24-48 months'
        else '48+ months'
      end`,
      total: count(),
      churned: sql<number>`sum(case when ${customers.isChurned} = true then 1 else 0 end)`,
    }).from(customers).groupBy(sql`case 
        when ${customers.tenureMonths} < 12 then '0-12 months'
        when ${customers.tenureMonths} < 24 then '12-24 months'
        when ${customers.tenureMonths} < 48 then '24-48 months'
        else '48+ months'
      end`);

    const monthlyChurnTrend = await db.select({
      month: sql<string>`to_char(${customers.churnDate}, 'YYYY-MM')`,
      count: count(),
      revenue: sql<number>`sum(${customers.monthlyRevenue})`,
    }).from(customers).where(sql`${customers.churnDate} is not null`).groupBy(sql`to_char(${customers.churnDate}, 'YYYY-MM')`).orderBy(sql`to_char(${customers.churnDate}, 'YYYY-MM')`);

    return {
      totalCustomers: totalCustomers[0].count,
      churnedCustomers: churnedCustomers[0].count,
      activeCustomers: activeCustomers[0].count,
      churnRate: totalCustomers[0].count > 0 ? (churnedCustomers[0].count / totalCustomers[0].count * 100).toFixed(1) : 0,
      avgMonthlyRevenue: avgRevenue[0]?.avg || 0,
      totalActiveRevenue: avgRevenue[0]?.total || 0,
      revenueAtRisk: revenueAtRisk[0]?.total || 0,
      riskDistribution,
      regionChurn,
      churnByReason,
      churnByTenure,
      monthlyChurnTrend,
    };
  }

  async getSegmentAnalytics(): Promise<any> {
    const byValueTier = await db.select({
      tier: customers.valueTier,
      total: count(),
      churned: sql<number>`sum(case when ${customers.isChurned} = true then 1 else 0 end)`,
      avgRevenue: sql<number>`avg(${customers.monthlyRevenue})`,
      avgRisk: sql<number>`avg(${customers.churnRiskScore})`,
    }).from(customers).groupBy(customers.valueTier);

    const byContractStatus = await db.select({
      status: customers.contractStatus,
      total: count(),
      churned: sql<number>`sum(case when ${customers.isChurned} = true then 1 else 0 end)`,
    }).from(customers).groupBy(customers.contractStatus);

    const byBundleType = await db.select({
      bundle: customers.bundleType,
      total: count(),
      churned: sql<number>`sum(case when ${customers.isChurned} = true then 1 else 0 end)`,
    }).from(customers).groupBy(customers.bundleType);

    const fiberImpact = await db.select({
      fiberAvailable: customers.fiberAvailable,
      total: count(),
      churned: sql<number>`sum(case when ${customers.isChurned} = true then 1 else 0 end)`,
    }).from(customers).groupBy(customers.fiberAvailable);

    const competitorImpact = await db.select({
      competitorAvailable: customers.competitorAvailable,
      total: count(),
      churned: sql<number>`sum(case when ${customers.isChurned} = true then 1 else 0 end)`,
    }).from(customers).groupBy(customers.competitorAvailable);

    return {
      byValueTier,
      byContractStatus,
      byBundleType,
      fiberImpact,
      competitorImpact,
    };
  }

  async getCommandCenterData(): Promise<any> {
    const allCustomers = await db.select().from(customers);
    const total = allCustomers.length;
    const churned = allCustomers.filter(c => c.isChurned);
    const active = allCustomers.filter(c => !c.isChurned);
    const atRisk = active.filter(c => (c.churnRiskScore || 0) > 0.6);
    const fiberExposed = active.filter(c => c.fiberAvailable);

    const allRecs = await db.select().from(recommendations);
    const runningActions = allRecs.filter(r => r.status === "in_progress");
    const completedSaves = allRecs.filter(r => r.status === "completed" && r.outcome === "retained");

    const revenueAtRisk = atRisk.reduce((s, c) => s + (c.monthlyRevenue || 0), 0) * 12;
    const retentionRate = allRecs.length > 0 ? (completedSaves.length / Math.max(allRecs.filter(r => r.status === "completed").length, 1) * 100) : 0;

    const riskDist = { low: 0, medium: 0, high: 0 };
    active.forEach(c => {
      const score = c.churnRiskScore || 0;
      if (score > 0.6) riskDist.high++;
      else if (score > 0.3) riskDist.medium++;
      else riskDist.low++;
    });

    const monthlyTrend = await db.select({
      month: sql<string>`to_char(${customers.churnDate}, 'YYYY-MM')`,
      count: count(),
      revenue: sql<number>`sum(${customers.monthlyRevenue})`,
    }).from(customers).where(sql`${customers.churnDate} is not null`).groupBy(sql`to_char(${customers.churnDate}, 'YYYY-MM')`).orderBy(sql`to_char(${customers.churnDate}, 'YYYY-MM')`);

    const churnReasons: Record<string, number> = {};
    churned.forEach(c => {
      const r = c.churnReason || "Unknown";
      churnReasons[r] = (churnReasons[r] || 0) + 1;
    });
    const topDrivers = Object.entries(churnReasons).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([driver, cnt]) => ({
      driver, count: cnt, percent: parseFloat(((cnt / Math.max(churned.length, 1)) * 100).toFixed(1)),
    }));

    const segmentRisk: Record<string, { total: number; atRisk: number }> = {};
    active.forEach(c => {
      const tier = c.valueTier || "Unknown";
      if (!segmentRisk[tier]) segmentRisk[tier] = { total: 0, atRisk: 0 };
      segmentRisk[tier].total++;
      if ((c.churnRiskScore || 0) > 0.6) segmentRisk[tier].atRisk++;
    });
    const topSegments = Object.entries(segmentRisk).sort((a, b) => b[1].atRisk - a[1].atRisk).slice(0, 5).map(([segment, d]) => ({
      segment, atRisk: d.atRisk, total: d.total, percent: parseFloat(((d.atRisk / Math.max(d.total, 1)) * 100).toFixed(1)),
    }));

    const regionAlerts: any[] = [];
    const regionGroups: Record<string, { fiber: number; outages: number; total: number; churned: number }> = {};
    allCustomers.forEach(c => {
      const r = c.region || "Unknown";
      if (!regionGroups[r]) regionGroups[r] = { fiber: 0, outages: 0, total: 0, churned: 0 };
      regionGroups[r].total++;
      if (c.fiberAvailable) regionGroups[r].fiber++;
      regionGroups[r].outages += c.outageCount || 0;
      if (c.isChurned) regionGroups[r].churned++;
    });
    Object.entries(regionGroups).forEach(([region, d]) => {
      const fiberPct = (d.fiber / Math.max(d.total, 1)) * 100;
      const churnPct = (d.churned / Math.max(d.total, 1)) * 100;
      if (fiberPct > 40) regionAlerts.push({ type: "fiber_rollout", region, message: `Fiber rollout in ${region} — ${fiberPct.toFixed(0)}% exposure`, severity: "high" });
      if (d.outages / Math.max(d.total, 1) > 3) regionAlerts.push({ type: "outages", region, message: `High outage frequency in ${region}`, severity: "medium" });
      if (churnPct > 35) regionAlerts.push({ type: "churn_spike", region, message: `Elevated churn rate in ${region} (${churnPct.toFixed(0)}%)`, severity: "high" });
    });

    return {
      kpis: {
        totalCustomers: total,
        activeCustomers: active.length,
        churnRate: parseFloat(((churned.length / Math.max(total, 1)) * 100).toFixed(1)),
        revenueAtRisk: Math.round(revenueAtRisk),
        customersAtRisk: atRisk.length,
        retentionSuccessRate: parseFloat(retentionRate.toFixed(1)),
        saveActionsRunning: runningActions.length,
        fiberCompetitionExposure: parseFloat(((fiberExposed.length / Math.max(active.length, 1)) * 100).toFixed(1)),
      },
      riskDistribution: riskDist,
      monthlyChurnTrend: monthlyTrend,
      topDrivers,
      topSegments,
      riskAlerts: regionAlerts.slice(0, 5),
    };
  }

  async getChurnDiagnostics(): Promise<any> {
    const allCustomers = await db.select().from(customers);
    const churned = allCustomers.filter(c => c.isChurned);
    const active = allCustomers.filter(c => !c.isChurned);

    const monthlyTrend = await db.select({
      month: sql<string>`to_char(${customers.churnDate}, 'YYYY-MM')`,
      count: count(),
      revenue: sql<number>`sum(${customers.monthlyRevenue})`,
    }).from(customers).where(sql`${customers.churnDate} is not null`).groupBy(sql`to_char(${customers.churnDate}, 'YYYY-MM')`).orderBy(sql`to_char(${customers.churnDate}, 'YYYY-MM')`);

    const tenureBuckets = [
      { label: "0-6 mo", min: 0, max: 6 },
      { label: "6-12 mo", min: 6, max: 12 },
      { label: "12-24 mo", min: 12, max: 24 },
      { label: "24-48 mo", min: 24, max: 48 },
      { label: "48+ mo", min: 48, max: 999 },
    ];
    const tenureCohorts = tenureBuckets.map(b => {
      const inBucket = allCustomers.filter(c => (c.tenureMonths || 0) >= b.min && (c.tenureMonths || 0) < b.max);
      const churnedInBucket = inBucket.filter(c => c.isChurned);
      return {
        bucket: b.label,
        total: inBucket.length,
        churned: churnedInBucket.length,
        retentionRate: parseFloat(((1 - churnedInBucket.length / Math.max(inBucket.length, 1)) * 100).toFixed(1)),
        churnRate: parseFloat(((churnedInBucket.length / Math.max(inBucket.length, 1)) * 100).toFixed(1)),
      };
    });

    const byValueTier = this.groupAndCount(allCustomers, "valueTier");
    const byBundle = this.groupAndCount(allCustomers, "bundleType");
    const byRegion = this.groupAndCount(allCustomers, "region");
    const byContract = this.groupAndCount(allCustomers, "contractStatus");

    const fiberZone = allCustomers.filter(c => c.fiberAvailable);
    const nonFiberZone = allCustomers.filter(c => !c.fiberAvailable);
    const segmentComparisons = {
      fiberVsNonFiber: {
        fiber: { total: fiberZone.length, churned: fiberZone.filter(c => c.isChurned).length, churnRate: parseFloat(((fiberZone.filter(c => c.isChurned).length / Math.max(fiberZone.length, 1)) * 100).toFixed(1)) },
        nonFiber: { total: nonFiberZone.length, churned: nonFiberZone.filter(c => c.isChurned).length, churnRate: parseFloat(((nonFiberZone.filter(c => c.isChurned).length / Math.max(nonFiberZone.length, 1)) * 100).toFixed(1)) },
      },
    };

    const driverContributions = this.computeDriverContributions(churned, allCustomers);

    const driverByRegion = this.computeDriversByDimension(allCustomers, "region");
    const driverByTier = this.computeDriversByDimension(allCustomers, "valueTier");

    const revLostByReason: Record<string, number> = {};
    const revLostBySegment: Record<string, number> = {};
    const revLostByRegion: Record<string, number> = {};
    churned.forEach(c => {
      const reason = c.churnReason || "Unknown";
      const seg = c.valueTier || "Unknown";
      const reg = c.region || "Unknown";
      revLostByReason[reason] = (revLostByReason[reason] || 0) + (c.monthlyRevenue || 0) * 12;
      revLostBySegment[seg] = (revLostBySegment[seg] || 0) + (c.monthlyRevenue || 0) * 12;
      revLostByRegion[reg] = (revLostByRegion[reg] || 0) + (c.monthlyRevenue || 0) * 12;
    });

    const totalRevLost = churned.reduce((s, c) => s + (c.monthlyRevenue || 0) * 12, 0);
    const avgRevPerChurned = churned.length > 0 ? totalRevLost / churned.length : 0;

    return {
      patterns: { monthlyTrend, tenureCohorts },
      segments: { byValueTier, byBundle, byRegion, byContract, segmentComparisons },
      drivers: { contributions: driverContributions, byRegion: driverByRegion, bySegment: driverByTier },
      financialImpact: {
        revenueLostByReason: this.mapToArray(revLostByReason),
        revenueLostBySegment: this.mapToArray(revLostBySegment),
        revenueLostByRegion: this.mapToArray(revLostByRegion),
        kpis: { totalAnnualRevenueLost: Math.round(totalRevLost), avgRevenuePerChurned: Math.round(avgRevPerChurned), revenueAtRisk: Math.round(active.filter(c => (c.churnRiskScore || 0) > 0.6).reduce((s, c) => s + (c.monthlyRevenue || 0) * 12, 0)) },
      },
    };
  }

  async getRiskIntelligence(): Promise<any> {
    const allCustomers = await db.select().from(customers);
    const active = allCustomers.filter(c => !c.isChurned);

    const scoreToCategory = (score: number): "low" | "medium" | "high" => {
      if (score > 0.6) return "high";
      if (score > 0.3) return "medium";
      return "low";
    };

    const riskDist = { low: 0, medium: 0, high: 0 };
    active.forEach(c => {
      riskDist[scoreToCategory(c.churnRiskScore || 0)]++;
    });

    const riskByRegion: Record<string, { low: number; medium: number; high: number }> = {};
    active.forEach(c => {
      const r = c.region || "Unknown";
      if (!riskByRegion[r]) riskByRegion[r] = { low: 0, medium: 0, high: 0 };
      riskByRegion[r][scoreToCategory(c.churnRiskScore || 0)]++;
    });

    const riskByTenure: Record<string, { low: number; medium: number; high: number; total: number }> = {};
    const tenureLabels = (t: number) => t < 12 ? "0-12 mo" : t < 24 ? "12-24 mo" : t < 48 ? "24-48 mo" : "48+ mo";
    active.forEach(c => {
      const b = tenureLabels(c.tenureMonths || 0);
      if (!riskByTenure[b]) riskByTenure[b] = { low: 0, medium: 0, high: 0, total: 0 };
      riskByTenure[b][scoreToCategory(c.churnRiskScore || 0)]++;
      riskByTenure[b].total++;
    });

    const probBuckets = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const probCurve = probBuckets.slice(0, -1).map((min, i) => {
      const max = probBuckets[i + 1];
      const inBucket = active.filter(c => (c.churnRiskScore || 0) >= min && (c.churnRiskScore || 0) < max);
      return { range: `${(min * 100).toFixed(0)}-${(max * 100).toFixed(0)}%`, count: inBucket.length, avgRevenue: inBucket.length > 0 ? Math.round(inBucket.reduce((s, c) => s + (c.monthlyRevenue || 0), 0) / inBucket.length) : 0 };
    });

    const earlyWarnings = active
      .filter(c => (c.churnRiskScore || 0) > 0.5)
      .sort((a, b) => (b.churnRiskScore || 0) - (a.churnRiskScore || 0))
      .slice(0, 20)
      .map(c => {
        const signals: string[] = [];
        if (c.fiberAvailable) signals.push("Fiber competitor present");
        if ((c.outageCount || 0) > 3) signals.push(`${c.outageCount} outages recorded`);
        if ((c.npsScore || 10) < 5) signals.push(`Low NPS score (${c.npsScore})`);
        if (c.contractStatus === "month-to-month") signals.push("Month-to-month contract");
        if ((c.ticketCount || 0) > 5) signals.push(`High ticket volume (${c.ticketCount})`);
        return { id: c.id, name: c.name, accountNumber: c.accountNumber, riskScore: c.churnRiskScore, revenue: c.monthlyRevenue, region: c.region, signals };
      });

    return {
      riskDistribution: riskDist,
      riskByRegion: Object.entries(riskByRegion).map(([region, d]) => ({ region, ...d })),
      riskByTenure: Object.entries(riskByTenure).map(([tenure, d]) => ({ tenure, ...d })),
      probabilityCurve: probCurve,
      earlyWarnings,
    };
  }

  async getRetentionData(): Promise<any> {
    const allRecs = await db.select().from(recommendations);
    const allCustomers = await db.select().from(customers);
    const customerMap = new Map(allCustomers.map(c => [c.id, c]));

    const enrichedRecs = allRecs.map(r => {
      const cust = customerMap.get(r.customerId);
      return {
        ...r,
        customerName: cust?.name || "Unknown",
        customerRegion: cust?.region || "Unknown",
        customerRevenue: cust?.monthlyRevenue || 0,
        riskScore: cust?.churnRiskScore || 0,
        roi: r.estimatedImpact && r.estimatedCost ? parseFloat(((r.estimatedImpact / Math.max(r.estimatedCost, 1))).toFixed(1)) : 0,
      };
    });

    const queue = {
      pending: enrichedRecs.filter(r => r.status === "pending"),
      inProgress: enrichedRecs.filter(r => r.status === "in_progress"),
      completed: enrichedRecs.filter(r => r.status === "completed"),
      declined: enrichedRecs.filter(r => r.status === "declined"),
    };

    const completedRecs = enrichedRecs.filter(r => r.status === "completed");
    const savedRecs = completedRecs.filter(r => r.outcome === "retained");

    const tracker = {
      actionsTriggered: allRecs.length,
      actionsExecuted: completedRecs.length,
      saveSuccessRate: parseFloat(((savedRecs.length / Math.max(completedRecs.length, 1)) * 100).toFixed(1)),
      avgResolutionDays: completedRecs.length > 0 ? parseFloat((completedRecs.filter(r => r.executedAt && r.createdAt).map(r => (new Date(r.executedAt!).getTime() - new Date(r.createdAt!).getTime()) / (1000 * 60 * 60 * 24)).reduce((s, d) => s + d, 0) / Math.max(completedRecs.filter(r => r.executedAt).length, 1)).toFixed(1)) : 0,
      totalCostSpent: Math.round(completedRecs.reduce((s, r) => s + (r.estimatedCost || 0), 0)),
      totalImpactGenerated: Math.round(savedRecs.reduce((s, r) => s + (r.estimatedImpact || 0), 0)),
    };

    return {
      recommendedActions: enrichedRecs.sort((a, b) => b.riskScore - a.riskScore).slice(0, 50),
      queue,
      tracker,
    };
  }

  async getBusinessImpact(): Promise<any> {
    const allRecs = await db.select().from(recommendations);
    const allCustomers = await db.select().from(customers);
    const customerMap = new Map(allCustomers.map(c => [c.id, c]));

    const completedRecs = allRecs.filter(r => r.status === "completed");
    const savedRecs = completedRecs.filter(r => r.outcome === "retained");

    const revenueProtected = savedRecs.reduce((s, r) => s + (r.estimatedImpact || 0), 0);
    const interventionCost = completedRecs.reduce((s, r) => s + (r.estimatedCost || 0), 0);
    const roiMultiple = interventionCost > 0 ? parseFloat((revenueProtected / interventionCost).toFixed(1)) : 0;

    const byActionType: Record<string, { count: number; cost: number; impact: number; saved: number }> = {};
    completedRecs.forEach(r => {
      const t = r.actionType || "Other";
      if (!byActionType[t]) byActionType[t] = { count: 0, cost: 0, impact: 0, saved: 0 };
      byActionType[t].count++;
      byActionType[t].cost += r.estimatedCost || 0;
      if (r.outcome === "retained") {
        byActionType[t].impact += r.estimatedImpact || 0;
        byActionType[t].saved++;
      }
    });

    const roiByAction = Object.entries(byActionType).map(([action, d]) => ({
      action,
      count: d.count,
      cost: Math.round(d.cost),
      impact: Math.round(d.impact),
      roi: d.cost > 0 ? parseFloat((d.impact / d.cost).toFixed(1)) : 0,
      successRate: parseFloat(((d.saved / Math.max(d.count, 1)) * 100).toFixed(1)),
    }));

    const savedBySegment: Record<string, number> = {};
    const savedByRegion: Record<string, number> = {};
    savedRecs.forEach(r => {
      const cust = customerMap.get(r.customerId);
      if (cust) {
        const seg = cust.valueTier || "Unknown";
        const reg = cust.region || "Unknown";
        savedBySegment[seg] = (savedBySegment[seg] || 0) + (r.estimatedImpact || 0);
        savedByRegion[reg] = (savedByRegion[reg] || 0) + (r.estimatedImpact || 0);
      }
    });

    const churned = allCustomers.filter(c => c.isChurned);
    const active = allCustomers.filter(c => !c.isChurned);
    const fiberEligible = active.filter(c => c.fiberAvailable);
    const migrationPotentialRevenue = fiberEligible.reduce((s, c) => s + (c.monthlyRevenue || 0), 0) * 12;

    return {
      revenueProtection: {
        revenueProtected: Math.round(revenueProtected),
        interventionCost: Math.round(interventionCost),
        roiMultiple,
        savedBySegment: this.mapToArray(savedBySegment),
        savedByRegion: this.mapToArray(savedByRegion),
      },
      roiByAction,
      migrationEconomics: {
        fiberEligibleCustomers: fiberEligible.length,
        migrationPotentialRevenue: Math.round(migrationPotentialRevenue),
        avgRevenuePerMigration: fiberEligible.length > 0 ? Math.round(migrationPotentialRevenue / fiberEligible.length) : 0,
        currentChurnInFiberZones: parseFloat(((fiberEligible.filter(c => (c.churnRiskScore || 0) > 0.6).length / Math.max(fiberEligible.length, 1)) * 100).toFixed(1)),
      },
    };
  }

  async getStrategyInsights(): Promise<any> {
    const allCustomers = await db.select().from(customers);
    const active = allCustomers.filter(c => !c.isChurned);

    const fiberZone = allCustomers.filter(c => c.fiberAvailable);
    const nonFiberZone = allCustomers.filter(c => !c.fiberAvailable);
    const fiberChurnRate = parseFloat(((fiberZone.filter(c => c.isChurned).length / Math.max(fiberZone.length, 1)) * 100).toFixed(1));
    const nonFiberChurnRate = parseFloat(((nonFiberZone.filter(c => c.isChurned).length / Math.max(nonFiberZone.length, 1)) * 100).toFixed(1));

    const competitorZone = allCustomers.filter(c => c.competitorAvailable);
    const nonCompetitorZone = allCustomers.filter(c => !c.competitorAvailable);
    const competitorChurnRate = parseFloat(((competitorZone.filter(c => c.isChurned).length / Math.max(competitorZone.length, 1)) * 100).toFixed(1));
    const nonCompetitorChurnRate = parseFloat(((nonCompetitorZone.filter(c => c.isChurned).length / Math.max(nonCompetitorZone.length, 1)) * 100).toFixed(1));

    const fiberEligible = active.filter(c => c.fiberAvailable);
    const migrationRevenue = fiberEligible.reduce((s, c) => s + (c.monthlyRevenue || 0), 0) * 12;

    const outageCorrelation = this.computeMetricCorrelation(allCustomers, "outageCount");
    const speedCorrelation = this.computeSpeedDegradationCorrelation(allCustomers);

    return {
      competitiveLandscape: {
        fiberZones: { churnRate: fiberChurnRate, total: fiberZone.length, churned: fiberZone.filter(c => c.isChurned).length },
        nonFiberZones: { churnRate: nonFiberChurnRate, total: nonFiberZone.length, churned: nonFiberZone.filter(c => c.isChurned).length },
        competitorZones: { churnRate: competitorChurnRate, total: competitorZone.length, churned: competitorZone.filter(c => c.isChurned).length },
        nonCompetitorZones: { churnRate: nonCompetitorChurnRate, total: nonCompetitorZone.length, churned: nonCompetitorZone.filter(c => c.isChurned).length },
        churnLiftFromFiber: parseFloat((fiberChurnRate - nonFiberChurnRate).toFixed(1)),
        churnLiftFromCompetitor: parseFloat((competitorChurnRate - nonCompetitorChurnRate).toFixed(1)),
      },
      migrationIntelligence: {
        eligibleCustomers: fiberEligible.length,
        migrationRevenuePotential: Math.round(migrationRevenue),
        avgRevenuePerCustomer: fiberEligible.length > 0 ? Math.round(migrationRevenue / fiberEligible.length) : 0,
        highRiskEligible: fiberEligible.filter(c => (c.churnRiskScore || 0) > 0.6).length,
      },
      networkHealth: {
        outageCorrelation,
        speedCorrelation,
      },
    };
  }

  private groupAndCount(custs: Customer[], field: keyof Customer) {
    const groups: Record<string, { total: number; churned: number; avgRevenue: number; revSum: number }> = {};
    custs.forEach(c => {
      const key = String((c as any)[field] || "Unknown");
      if (!groups[key]) groups[key] = { total: 0, churned: 0, avgRevenue: 0, revSum: 0 };
      groups[key].total++;
      groups[key].revSum += c.monthlyRevenue || 0;
      if (c.isChurned) groups[key].churned++;
    });
    return Object.entries(groups).map(([name, d]) => ({
      name,
      total: d.total,
      churned: d.churned,
      churnRate: parseFloat(((d.churned / Math.max(d.total, 1)) * 100).toFixed(1)),
      avgRevenue: Math.round(d.revSum / Math.max(d.total, 1)),
    }));
  }

  private mapToArray(obj: Record<string, number>) {
    return Object.entries(obj).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);
  }

  private computeDriverContributions(churned: Customer[], all: Customer[]) {
    const total = churned.length || 1;
    const fiberChurn = churned.filter(c => c.fiberAvailable).length;
    const competitorChurn = churned.filter(c => c.competitorAvailable).length;
    const qualityChurn = churned.filter(c => (c.outageCount || 0) > 3 || (c.npsScore || 10) < 5).length;
    const priceChurn = churned.filter(c => c.churnReason?.toLowerCase().includes("price") || c.churnReason?.toLowerCase().includes("cost")).length;
    const techChurn = churned.filter(c => c.churnReason?.toLowerCase().includes("speed") || c.churnReason?.toLowerCase().includes("technology")).length;
    const contractChurn = churned.filter(c => c.contractStatus === "month-to-month").length;

    const raw = [
      { driver: "Fiber Competition", count: fiberChurn },
      { driver: "Service Quality", count: qualityChurn },
      { driver: "Pricing", count: priceChurn },
      { driver: "Technology Gap", count: techChurn },
      { driver: "Competitor Presence", count: competitorChurn },
      { driver: "Contract Status", count: contractChurn },
    ];

    const totalCounts = raw.reduce((s, r) => s + r.count, 0) || 1;
    return raw.map(r => ({ ...r, percent: parseFloat(((r.count / totalCounts) * 100).toFixed(1)) })).sort((a, b) => b.percent - a.percent);
  }

  private computeDriversByDimension(custs: Customer[], dim: keyof Customer) {
    const groups: Record<string, Customer[]> = {};
    custs.forEach(c => {
      const key = String((c as any)[dim] || "Unknown");
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return Object.entries(groups).map(([name, cs]) => {
      const churned = cs.filter(c => c.isChurned);
      return {
        name,
        churnRate: parseFloat(((churned.length / Math.max(cs.length, 1)) * 100).toFixed(1)),
        fiberImpact: parseFloat(((churned.filter(c => c.fiberAvailable).length / Math.max(churned.length, 1)) * 100).toFixed(1)),
        qualityImpact: parseFloat(((churned.filter(c => (c.outageCount || 0) > 3).length / Math.max(churned.length, 1)) * 100).toFixed(1)),
      };
    });
  }

  private computeMetricCorrelation(custs: Customer[], metric: keyof Customer) {
    const buckets = [0, 1, 2, 3, 5, 8, 12, 20];
    return buckets.slice(0, -1).map((min, i) => {
      const max = buckets[i + 1];
      const inBucket = custs.filter(c => ((c as any)[metric] || 0) >= min && ((c as any)[metric] || 0) < max);
      const churned = inBucket.filter(c => c.isChurned);
      return {
        range: `${min}-${max}`,
        total: inBucket.length,
        churned: churned.length,
        churnRate: parseFloat(((churned.length / Math.max(inBucket.length, 1)) * 100).toFixed(1)),
      };
    }).filter(b => b.total > 0);
  }

  private computeSpeedDegradationCorrelation(custs: Customer[]) {
    const buckets = [
      { label: "0-10%", min: 0, max: 0.1 },
      { label: "10-20%", min: 0.1, max: 0.2 },
      { label: "20-30%", min: 0.2, max: 0.3 },
      { label: "30-50%", min: 0.3, max: 0.5 },
      { label: "50%+", min: 0.5, max: 1.0 },
    ];
    return buckets.map(b => {
      const inBucket = custs.filter(c => {
        if (!c.provisionedSpeed || !c.actualSpeed) return false;
        const gap = (c.provisionedSpeed - c.actualSpeed) / c.provisionedSpeed;
        return gap >= b.min && gap < b.max;
      });
      const churned = inBucket.filter(c => c.isChurned);
      return {
        range: b.label,
        total: inBucket.length,
        churned: churned.length,
        churnRate: parseFloat(((churned.length / Math.max(inBucket.length, 1)) * 100).toFixed(1)),
      };
    }).filter(b => b.total > 0);
  }
}

export const storage = new DatabaseStorage();
