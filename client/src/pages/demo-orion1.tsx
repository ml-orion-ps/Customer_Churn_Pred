import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getIndustry, getUseCase, UseCaseDef } from "@/data/use-cases";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Database, FlaskConical, Rocket, TrendingUp, Gavel, BriefcaseBusiness,
  CheckCircle2, Clock, AlertTriangle, ArrowLeft, ChevronRight,
  Activity, Layers, Cpu, Package, Shield, FileText, Star,
  BarChart3, Zap, Target, Code2, ChevronUp, ChevronDown, FileCode,
  Pencil, X, RotateCcw, Save, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/* ─── Types ─────────────────────────────────────────────────────── */
interface DatasetDef { name: string; rows: string; cols: number; quality: number; updated: string; source: string; }

type CodeFileTab = {
  id: string;
  label: string;
  description: string;
};

type CodeFileContent = {
  id: string;
  label: string;
  description: string;
  content: string;
  lines: number;
  lastModified: string;
};

/* ─── Dataset library (3-4 per use case) ────────────────────────── */
const DATASETS: Record<string, DatasetDef[]> = {
  "cpg:price-promo": [
    { name: "RGM Transaction History", rows: "2.84M", cols: 24, quality: 94, updated: "Nov 30 2025", source: "SAP / POS" },
    { name: "Competitor Price Intelligence", rows: "184K", cols: 12, quality: 88, updated: "Nov 28 2025", source: "Nielsen / Spins" },
    { name: "Promotional Calendar 2025", rows: "2.4K", cols: 18, quality: 98, updated: "Oct 01 2025", source: "Trade Marketing" },
    { name: "Distribution Coverage Data", rows: "48K", cols: 10, quality: 91, updated: "Nov 15 2025", source: "DSD System" },
  ],
  "cpg:demand-forecasting": [
    { name: "POS Sales History (3yr)", rows: "5.2M", cols: 16, quality: 96, updated: "Nov 30 2025", source: "SAP / POS" },
    { name: "Supply Chain Events Log", rows: "84K", cols: 14, quality: 89, updated: "Nov 20 2025", source: "ERP System" },
    { name: "Seasonal Index Reference", rows: "4.8K", cols: 8, quality: 99, updated: "Sep 01 2025", source: "Analytics Team" },
    { name: "Promotional Lift History", rows: "24K", cols: 12, quality: 92, updated: "Nov 01 2025", source: "Trade Marketing" },
  ],
  "cpg:trade-promotion": [
    { name: "Trade Spend Records", rows: "1.2M", cols: 20, quality: 93, updated: "Nov 30 2025", source: "TPM System" },
    { name: "Retailer Compliance Audit", rows: "48K", cols: 15, quality: 86, updated: "Nov 22 2025", source: "Field Sales" },
    { name: "Volume Lift History", rows: "380K", cols: 18, quality: 91, updated: "Nov 10 2025", source: "AC Nielsen" },
    { name: "Promo Baseline Data", rows: "240K", cols: 10, quality: 94, updated: "Oct 31 2025", source: "Analytics Team" },
  ],
  "cpg:shelf-optimization": [
    { name: "Planogram Compliance Data", rows: "240K", cols: 18, quality: 87, updated: "Nov 25 2025", source: "Field Audit" },
    { name: "SKU Velocity & Facings", rows: "1.1M", cols: 14, quality: 93, updated: "Nov 28 2025", source: "POS / WMS" },
    { name: "Retail Space Index", rows: "84K", cols: 12, quality: 90, updated: "Nov 01 2025", source: "Retail Partner" },
    { name: "Distribution Coverage", rows: "48K", cols: 9, quality: 95, updated: "Nov 15 2025", source: "DSD System" },
  ],
  "cpg:brand-health": [
    { name: "Brand Equity Tracker", rows: "24K", cols: 28, quality: 88, updated: "Nov 15 2025", source: "Kantar / Ipsos" },
    { name: "Social Listening Data", rows: "2.4M", cols: 16, quality: 82, updated: "Nov 30 2025", source: "Brandwatch" },
    { name: "Media Investment Data", rows: "48K", cols: 22, quality: 94, updated: "Nov 28 2025", source: "MMS / Nielsen" },
    { name: "NPS Survey Responses", rows: "84K", cols: 14, quality: 96, updated: "Nov 20 2025", source: "Qualtrics" },
  ],
  "retail:customer-loyalty": [
    { name: "Customer 360 Profile", rows: "2.1M", cols: 32, quality: 92, updated: "Nov 30 2025", source: "CRM / CDP" },
    { name: "Transaction History (2yr)", rows: "18.4M", cols: 14, quality: 96, updated: "Nov 30 2025", source: "POS System" },
    { name: "Loyalty Program Data", rows: "1.4M", cols: 18, quality: 94, updated: "Nov 28 2025", source: "Loyalty Platform" },
    { name: "NPS & Feedback Data", rows: "240K", cols: 12, quality: 89, updated: "Nov 22 2025", source: "Medallia" },
  ],
  "retail:demand-forecasting-retail": [
    { name: "Store Item Sales History", rows: "84M", cols: 12, quality: 95, updated: "Nov 30 2025", source: "POS System" },
    { name: "Store Cluster Attributes", rows: "4.2K", cols: 24, quality: 98, updated: "Sep 01 2025", source: "Analytics Team" },
    { name: "Promotional Event Calendar", rows: "8.4K", cols: 16, quality: 97, updated: "Nov 01 2025", source: "Marketing" },
    { name: "Weather & External Signals", rows: "1.2M", cols: 10, quality: 86, updated: "Nov 30 2025", source: "Weather API" },
  ],
  "retail:basket-analysis": [
    { name: "Transaction Baskets (90d)", rows: "1.2M", cols: 8, quality: 96, updated: "Nov 30 2025", source: "POS System" },
    { name: "Product Catalog & Attributes", rows: "84K", cols: 28, quality: 99, updated: "Nov 01 2025", source: "MDM System" },
    { name: "Customer Session Data", rows: "4.8M", cols: 14, quality: 88, updated: "Nov 30 2025", source: "Web Analytics" },
    { name: "Product Affinity Matrix", rows: "240K", cols: 3, quality: 91, updated: "Nov 28 2025", source: "Analytics Team" },
  ],
  "retail:inventory-optimization": [
    { name: "Inventory On-Hand Data", rows: "2.4M", cols: 16, quality: 94, updated: "Nov 30 2025", source: "WMS System" },
    { name: "Replenishment History", rows: "8.4M", cols: 18, quality: 92, updated: "Nov 30 2025", source: "Supply Chain" },
    { name: "Supplier Lead Time Data", rows: "84K", cols: 12, quality: 87, updated: "Nov 20 2025", source: "Procurement" },
    { name: "Demand Forecast Output", rows: "1.1M", cols: 8, quality: 95, updated: "Nov 28 2025", source: "Forecasting Model" },
  ],
  "retail:store-performance": [
    { name: "Store Sales & P&L Data", rows: "4.2K", cols: 48, quality: 96, updated: "Nov 30 2025", source: "Finance / ERP" },
    { name: "Footfall Traffic Counts", rows: "8.4M", cols: 10, quality: 88, updated: "Nov 30 2025", source: "Sensormatic" },
    { name: "Staff Scheduling Records", rows: "1.8M", cols: 14, quality: 93, updated: "Nov 28 2025", source: "Workforce Mgmt" },
    { name: "Store Attribute Profiles", rows: "4.2K", cols: 36, quality: 99, updated: "Jun 01 2025", source: "Real Estate / Analytics" },
  ],
  "tmt:arpu-optimization": [
    { name: "Subscriber Revenue History", rows: "4.8M", cols: 24, quality: 94, updated: "Nov 30 2025", source: "BSS / Billing" },
    { name: "Product Bundle Catalog", rows: "2.4K", cols: 18, quality: 98, updated: "Oct 01 2025", source: "Product Mgmt" },
    { name: "Upgrade & Downgrade Log", rows: "840K", cols: 12, quality: 92, updated: "Nov 28 2025", source: "CRM System" },
    { name: "Competitor Offer Intelligence", rows: "48K", cols: 16, quality: 84, updated: "Nov 15 2025", source: "Market Intel" },
  ],
  "tmt:network-quality": [
    { name: "Network Performance Metrics", rows: "12M", cols: 28, quality: 91, updated: "Nov 30 2025", source: "OSS / NMS" },
    { name: "Customer Complaint Records", rows: "1.8M", cols: 16, quality: 94, updated: "Nov 30 2025", source: "CRM / IVR" },
    { name: "Tower Coverage Data", rows: "240K", cols: 22, quality: 97, updated: "Nov 01 2025", source: "Network Eng." },
    { name: "Service Ticket History", rows: "4.2M", cols: 18, quality: 90, updated: "Nov 28 2025", source: "ITSM System" },
  ],
  "tmt:subscriber-ltv": [
    { name: "Subscriber 360 Profile", rows: "4.8M", cols: 36, quality: 93, updated: "Nov 30 2025", source: "CRM / BSS" },
    { name: "Revenue & Usage History", rows: "24M", cols: 18, quality: 96, updated: "Nov 30 2025", source: "BSS / Billing" },
    { name: "Churn & Retention Records", rows: "2.4M", cols: 14, quality: 92, updated: "Nov 28 2025", source: "CRM System" },
    { name: "NPS & Satisfaction Data", rows: "840K", cols: 12, quality: 88, updated: "Nov 20 2025", source: "Survey Platform" },
  ],
  "tmt:fraud-detection-tmt": [
    { name: "Call Detail Records (CDR)", rows: "480M", cols: 22, quality: 94, updated: "Nov 30 2025", source: "OSS / Network" },
    { name: "SIM Swap Event Log", rows: "2.4M", cols: 14, quality: 98, updated: "Nov 30 2025", source: "CRM / BSS" },
    { name: "Payment Transaction History", rows: "12M", cols: 18, quality: 92, updated: "Nov 30 2025", source: "Billing System" },
    { name: "Device Fingerprint Database", rows: "8.4M", cols: 16, quality: 89, updated: "Nov 29 2025", source: "Auth System" },
  ],
  "bfsi:credit-risk": [
    { name: "Loan Application History", rows: "2.4M", cols: 42, quality: 94, updated: "Nov 30 2025", source: "LOS System" },
    { name: "Bureau Credit Data (Equifax)", rows: "2.4M", cols: 64, quality: 97, updated: "Nov 28 2025", source: "Credit Bureau" },
    { name: "Payment Performance History", rows: "18M", cols: 16, quality: 96, updated: "Nov 30 2025", source: "Core Banking" },
    { name: "Macroeconomic Signals", rows: "4.8K", cols: 24, quality: 88, updated: "Nov 25 2025", source: "Federal Reserve / BLS" },
  ],
  "bfsi:banking-churn": [
    { name: "Customer Relationship Data", rows: "4.8M", cols: 48, quality: 93, updated: "Nov 30 2025", source: "CRM / Core Banking" },
    { name: "Digital Engagement Log", rows: "84M", cols: 12, quality: 91, updated: "Nov 30 2025", source: "Digital Banking" },
    { name: "Product Holdings History", rows: "12M", cols: 16, quality: 96, updated: "Nov 28 2025", source: "Core Banking" },
    { name: "NPS & Complaint Records", rows: "1.2M", cols: 14, quality: 88, updated: "Nov 22 2025", source: "VOC Platform" },
  ],
  "bfsi:fraud-detection-bfsi": [
    { name: "Transaction History (Real-time)", rows: "240M", cols: 24, quality: 96, updated: "Nov 30 2025", source: "Payment Switch" },
    { name: "Account Behaviour Baseline", rows: "4.8M", cols: 32, quality: 93, updated: "Nov 29 2025", source: "Core Banking" },
    { name: "Device & Session Intelligence", rows: "18M", cols: 18, quality: 89, updated: "Nov 30 2025", source: "Auth System" },
    { name: "Confirmed Fraud Case Labels", rows: "480K", cols: 12, quality: 98, updated: "Nov 25 2025", source: "Fraud Ops" },
  ],
  "bfsi:cross-sell": [
    { name: "Customer Product Holdings", rows: "8.4M", cols: 36, quality: 94, updated: "Nov 30 2025", source: "Core Banking" },
    { name: "Customer Financial Profile", rows: "4.8M", cols: 48, quality: 92, updated: "Nov 28 2025", source: "CRM / Bureau" },
    { name: "Offer Acceptance History", rows: "2.4M", cols: 18, quality: 91, updated: "Nov 25 2025", source: "Campaign Mgmt" },
    { name: "Life Event Signal Data", rows: "840K", cols: 14, quality: 86, updated: "Nov 20 2025", source: "External Data" },
  ],
  "bfsi:claims-prediction": [
    { name: "Claims History (5yr)", rows: "4.2M", cols: 38, quality: 94, updated: "Nov 30 2025", source: "Claims System" },
    { name: "Policy Attributes Database", rows: "2.4M", cols: 52, quality: 97, updated: "Nov 28 2025", source: "Policy Admin" },
    { name: "Fraud Indicator Labels", rows: "1.2M", cols: 14, quality: 96, updated: "Nov 25 2025", source: "SIU Records" },
    { name: "External Risk Signals", rows: "840K", cols: 20, quality: 87, updated: "Nov 22 2025", source: "Weather / Court" },
  ],
};

/* ─── Algorithm performance benchmarks ──────────────────────────── */
const ALGO_METRICS_CLASS: Record<string, { auc: number; precision: number; recall: number; f1: number }> = {
  "Gradient Boosting": { auc: 0.84, precision: 0.78, recall: 0.72, f1: 0.75 },
  "XGBoost": { auc: 0.83, precision: 0.77, recall: 0.71, f1: 0.74 },
  "Neural Network": { auc: 0.82, precision: 0.76, recall: 0.70, f1: 0.73 },
  "Random Forest": { auc: 0.81, precision: 0.74, recall: 0.70, f1: 0.72 },
  "Logistic Regression": { auc: 0.76, precision: 0.70, recall: 0.65, f1: 0.67 },
  "Isolation Forest": { auc: 0.85, precision: 0.80, recall: 0.68, f1: 0.74 },
  "Collaborative Filtering": { auc: 0.79, precision: 0.72, recall: 0.66, f1: 0.69 },
  "Scorecard": { auc: 0.74, precision: 0.68, recall: 0.64, f1: 0.66 },
  "Survival Analysis": { auc: 0.78, precision: 0.72, recall: 0.67, f1: 0.69 },
  "Default": { auc: 0.77, precision: 0.71, recall: 0.66, f1: 0.68 },
};

const ALGO_METRICS_REG: Record<string, { rmse: number; r2: number; mape: number }> = {
  "Gradient Boosting": { rmse: 840, r2: 0.84, mape: 6.2 },
  "XGBoost": { rmse: 880, r2: 0.82, mape: 6.8 },
  "Random Forest": { rmse: 1020, r2: 0.78, mape: 7.8 },
  "Neural Network": { rmse: 920, r2: 0.80, mape: 7.2 },
  "LSTM": { rmse: 960, r2: 0.79, mape: 7.4 },
  "Prophet": { rmse: 1120, r2: 0.74, mape: 8.4 },
  "SARIMA": { rmse: 1180, r2: 0.72, mape: 9.1 },
  "Linear Regression": { rmse: 1380, r2: 0.64, mape: 11.2 },
  "Ridge Regression": { rmse: 1340, r2: 0.66, mape: 10.8 },
  "GLM (Tweedie)": { rmse: 1280, r2: 0.68, mape: 10.4 },
  "Simulation-based Optimization": { rmse: 780, r2: 0.86, mape: 5.8 },
  "Association Rules": { rmse: 1140, r2: 0.73, mape: 8.8 },
  "Neural CF": { rmse: 910, r2: 0.80, mape: 7.3 },
  "Default": { rmse: 1100, r2: 0.74, mape: 9.0 },
};

function isClassification(targetVariable: string): boolean {
  return /is_|probability|default|churn|fraud/.test(targetVariable.toLowerCase());
}

function getBestAlgo(useCase: UseCaseDef, classification: boolean): string {
  const algos = useCase.orionContext.algorithms;
  // pick the one with best metric
  if (classification) {
    let best = algos[0];
    algos.forEach(a => {
      const m = ALGO_METRICS_CLASS[a] ?? ALGO_METRICS_CLASS.Default;
      const bm = ALGO_METRICS_CLASS[best] ?? ALGO_METRICS_CLASS.Default;
      if (m.auc > bm.auc) best = a;
    });
    return best;
  } else {
    let best = algos[0];
    algos.forEach(a => {
      const m = ALGO_METRICS_REG[a] ?? ALGO_METRICS_REG.Default;
      const bm = ALGO_METRICS_REG[best] ?? ALGO_METRICS_REG.Default;
      if (m.r2 > bm.r2) best = a;
    });
    return best;
  }
}

const CHART_COLOR = "#FFD822";
const tick = { fontSize: 10, fill: "#ffffff55" };
const tooltip = { background: "#1c1c1e", border: "1px solid #ffffff18", borderRadius: 6, fontSize: 11 };

/* ─── PAGE: Overview ────────────────────────────────────────────── */
function PageOverview({ useCase, isClass, bestAlgo, industryId, useCaseId }: any) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [codeOpen, setCodeOpen] = useState(false);
  const [activeFileId, setActiveFileId] = useState("train_model");
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState(false);

  const features = useCase.orionContext.features.slice(0, 8).map((f: string, i: number) => ({
    name: f,
    importance: +(0.28 - i * 0.028 + (i % 3) * 0.008).toFixed(3),
  }));
  const primaryMetric = isClass ? "AUC" : "R²";
  const primaryValue = isClass
    ? (ALGO_METRICS_CLASS[bestAlgo] ?? ALGO_METRICS_CLASS.Default).auc
    : (ALGO_METRICS_REG[bestAlgo] ?? ALGO_METRICS_REG.Default).r2;

  const trainingHistory = ["Oct", "Nov", "Dec"].map((m, i) => ({
    name: m, score: +(primaryValue - 0.06 + i * 0.03).toFixed(3),
  }));

  const { data: codeFiles } = useQuery<CodeFileTab[]>({
    queryKey: ["/api/code/files"],
  });
  const {
    data: codeFile,
    isLoading: codeLoading,
  } = useQuery<CodeFileContent>({
    queryKey: ["/api/code", activeFileId],
    enabled: codeOpen && Boolean(activeFileId),
  });

  const saveMut = useMutation({
    mutationFn: async ({ fileId, content }: { fileId: string; content: string }) => {
      const response = await apiRequest("PUT", `/api/code/${fileId}`, { content });
      return response.json();
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/code", activeFileId] });
      setEditMode(false);
      setSavedBanner(true);
      setTimeout(() => setSavedBanner(false), 2500);
      toast({ title: "Code saved successfully", description: "The backend logic has been updated and will take effect on next execution." });
    },
    onError: (error: any) => {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    },
  });

  const startEdit = () => {
    if (!codeFile) return;
    setEditContent(codeFile.content);
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditContent(codeFile?.content ?? null);
  };

  const saveEdit = () => {
    if (!activeFileId || editContent === null) return;
    saveMut.mutate({ fileId: activeFileId, content: editContent });
  };

  return (
    <div className="space-y-4 pb-12">
      {/* Model card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BriefcaseBusiness className="w-4 h-4 text-muted-foreground" />
              Active Model
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Target Variable</div>
                  <div className="font-mono text-xs mt-1 px-2 py-1 bg-black/30 rounded inline-block" style={{ color: CHART_COLOR }}>
                    {useCase.orionContext.targetVariable}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Best Algorithm</div>
                  <div className="text-sm font-semibold mt-1">{bestAlgo}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Model Type</div>
                  <div className="text-sm font-medium mt-1">{isClass ? "Classification" : "Regression"}</div>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{primaryMetric} Score</div>
                  <div className="text-3xl font-bold mt-1" style={{ color: CHART_COLOR }}>{primaryValue.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Feature Count</div>
                  <div className="text-sm font-semibold mt-1">{useCase.orionContext.features.length}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Status</div>
                  <Badge className="mt-1 text-[9px] bg-green-500/15 text-green-400 border border-green-500/30">Deployed</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Training History</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={trainingHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="name" tick={tick} />
                <YAxis tick={tick} domain={["auto", "auto"]} />
                <Tooltip contentStyle={tooltip} />
                <Line type="monotone" dataKey="score" stroke={CHART_COLOR} strokeWidth={2} dot={{ fill: CHART_COLOR, r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Feature importance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            Feature Importance (Top {features.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={features} layout="vertical" margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis type="number" tick={tick} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "#ffffff70" }} width={160} />
              <Tooltip contentStyle={tooltip} />
              <Bar dataKey="importance" radius={[0, 3, 3, 0]}>
                {features.map((_: any, i: number) => (
                  <Cell key={i} fill={i === 0 ? CHART_COLOR : `${CHART_COLOR}${Math.round(90 - i * 10).toString(16)}`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* EDA highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {useCase.orionContext.edaHighlights.map((h: string, i: number) => (
          <div key={i} className="rounded-lg border border-border/50 bg-muted/20 p-3">
            <div className="w-6 h-6 rounded-md bg-yellow-500/15 flex items-center justify-center mb-2">
              <Activity className="w-3.5 h-3.5 text-yellow-400" />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{h}</p>
          </div>
        ))}
      </div>

      {/* ── BACKEND CODE EXPLORER ── */}
      <div className="border rounded-lg bg-card mt-8 overflow-hidden border-yellow-500/20 shadow-lg shadow-yellow-500/5">
        <button
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left bg-yellow-500/5"
          onClick={() => { setCodeOpen(o => !o); setEditMode(false); setEditContent(null); }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center">
              <Code2 className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <span className="text-sm font-bold text-yellow-500">Expert Mode: Backend Code Explorer</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">Directly review and modify the ML pipeline and data logic components</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {codeOpen ? <ChevronUp className="w-5 h-5 text-yellow-500/70" /> : <ChevronDown className="w-5 h-5 text-yellow-500/70" />}
          </div>
        </button>

        {codeOpen && (
          <div className="border-t border-yellow-500/10">
            {/* File tabs */}
            <div className="flex items-center gap-0 border-b border-border/40 bg-muted/20 overflow-x-auto scrollbar-hide">
              {(codeFiles || []).map((f: any) => (
                <button
                  key={f.id}
                  onClick={() => { setActiveFileId(f.id); setEditMode(false); setEditContent(null); }}
                  className={`flex items-center gap-2 px-5 py-3 text-[11px] font-semibold border-b-2 transition-all whitespace-nowrap ${
                    activeFileId === f.id
                      ? "border-yellow-500 text-yellow-500 bg-background"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  {f.label}
                </button>
              ))}
            </div>

            {/* File metadata bar */}
            {codeFile && !codeLoading && (
              <div className="flex items-center justify-between px-5 py-2.5 bg-muted/10 border-b border-border/40 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/50" />
                    <span className="font-mono text-foreground/90 font-semibold">{codeFile.label}</span>
                  </div>
                  <span>{codeFile.lines?.toLocaleString()} lines</span>
                  <span>Last modified: {new Date(codeFile.lastModified).toLocaleDateString()}</span>
                  {savedBanner && (
                    <span className="flex items-center gap-1.5 text-green-400 font-bold animate-in fade-in slide-in-from-left-2">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Changes Deployed
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {!editMode ? (
                    <button
                      onClick={startEdit}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10 transition-all font-medium"
                    >
                      <Pencil className="w-3 h-3" /> Edit Code
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={cancelEdit}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-all"
                      >
                        <X className="w-3 h-3" /> Cancel
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={saveMut.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-yellow-500 text-black hover:bg-yellow-400 transition-all disabled:opacity-50 font-bold"
                      >
                        <Save className="w-3 h-3" /> {saveMut.isPending ? "Saving..." : "Deploy Changes"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Description */}
            {codeFile && !codeLoading && (
              <div className="px-5 py-2.5 border-b border-border/40 bg-yellow-500/5">
                <p className="text-[10px] text-yellow-400 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
                  {codeFile.description}
                </p>
              </div>
            )}

            {/* Code area */}
            <div className="relative">
              {codeLoading && (
                <div className="h-80 flex items-center justify-center text-xs text-muted-foreground animate-pulse">
                  Fetching source code...
                </div>
              )}
              {!codeLoading && codeFile && (
                editMode ? (
                  <textarea
                    className="w-full font-mono text-[11px] leading-6 bg-black text-gray-200 p-6 resize-none outline-none border-0 selection:bg-yellow-500/30 overflow-auto"
                    style={{ height: "500px", tabSize: 2 }}
                    value={editContent ?? ""}
                    onChange={e => setEditContent(e.target.value)}
                    spellCheck={false}
                    onKeyDown={e => {
                      if (e.key === "Tab") {
                        e.preventDefault();
                        const start = e.currentTarget.selectionStart;
                        const end = e.currentTarget.selectionEnd;
                        const val = editContent ?? "";
                        setEditContent(val.substring(0, start) + "  " + val.substring(end));
                        setTimeout(() => { e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2; }, 0);
                      }
                    }}
                  />
                ) : (
                  <div className="relative bg-[#0d0d0d] overflow-auto border-0" style={{ maxHeight: "500px" }}>
                    <pre className="text-[11px] leading-6 text-gray-300 p-6 m-0 whitespace-pre font-mono">
                      {(codeFile.content || "").split("\n").map((line: string, i: number) => (
                        <div key={i} className="flex group hover:bg-white/5 transition-colors">
                          <span className="select-none text-gray-600 pr-6 text-right min-w-[3.5rem] border-r border-white/5 mr-4">{i + 1}</span>
                          <span className="flex-1">{line || " "}</span>
                        </div>
                      ))}
                    </pre>
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── PAGE: Data Hub ─────────────────────────────────────────────── */
function PageData({ useCase, datasets, industryId, useCaseId }: any) {
  const [selectedDs, setSelectedDs] = useState(0);
  const ds = datasets[selectedDs];
  const features = useCase.orionContext.features;

  const featureDescriptions: Record<string, string> = {
    base_price: "Shelf price before promotional adjustments",
    promo_depth: "Discount % applied during promotional event",
    lag_4wk_demand: "Actual demand 4 weeks prior (units)",
    lag_13wk_demand: "Actual demand 13 weeks prior (units)",
    season_index: "Seasonal adjustment factor (1.0 = baseline)",
    promo_flag: "Binary indicator for active promotion",
    competitor_price: "Competitor shelf price (category benchmark)",
    distribution_pct: "Weighted distribution across outlets (%)",
    velocity_rank: "ABC velocity classification (A/B/C/D)",
    lead_time: "Avg supplier lead time (days)",
    demand_variability: "Coefficient of variation of weekly demand",
    tenure_months: "Months since first account opening",
    monthly_revenue: "Monthly recurring revenue (USD)",
    bundle_count: "Number of active product bundles",
    nps_score: "Net Promoter Score (−100 to 100)",
    days_since_purchase: "Days elapsed since last transaction",
    purchase_frequency: "Number of purchases in last 90 days",
    avg_order_value: "Average transaction value (USD)",
    credit_score: "Bureau credit score (300–850)",
    debt_to_income: "Total debt payments / gross income",
    payment_history: "24-month payment performance index",
    utilization_rate: "Credit utilization as % of limit",
    transaction_amount: "Value of the flagged transaction (USD)",
    velocity_24hr: "Number of transactions in last 24 hours",
    location_mismatch: "Flag: transaction location differs from home region",
    device_fingerprint_change: "Flag: new device detected for account",
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Dataset list */}
      <div className="space-y-2">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 font-semibold">Dataset Library</div>
        {datasets.map((d: DatasetDef, i: number) => (
          <button
            key={d.name}
            onClick={() => setSelectedDs(i)}
            className={`w-full text-left rounded-lg border p-3 transition-colors ${selectedDs === i ? "border-yellow-500/40 bg-yellow-500/8" : "border-border/40 bg-muted/10 hover:bg-muted/20"}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-3.5 h-3.5" style={{ color: selectedDs === i ? CHART_COLOR : "#ffffff60" }} />
              <span className="text-xs font-medium">{d.name}</span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground ml-5">
              <span>{d.rows} rows</span>
              <span>{d.cols} cols</span>
              <span className={`font-semibold ${d.quality >= 90 ? "text-green-400" : "text-amber-400"}`}>{d.quality}% quality</span>
            </div>
          </button>
        ))}
      </div>

      {/* Dataset detail */}
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Package className="w-4 h-4 text-muted-foreground" />
              {ds.name}
            </CardTitle>
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground mt-1">
              <span>{ds.rows} rows · {ds.cols} columns</span>
              <span>Source: {ds.source}</span>
              <span>Updated: {ds.updated}</span>
            </div>
          </CardHeader>
          <CardContent>
            {/* Quality + completeness */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "Quality Score", value: `${ds.quality}%`, color: ds.quality >= 90 ? "text-green-400" : "text-amber-400" },
                { label: "Completeness", value: `${Math.min(99, ds.quality + 2)}%`, color: "text-blue-400" },
                { label: "Uniqueness", value: `${Math.min(99, ds.quality - 1)}%`, color: "text-violet-400" },
              ].map(m => (
                <div key={m.label} className="rounded-lg border border-border/40 p-2.5 text-center">
                  <div className="text-[10px] text-muted-foreground">{m.label}</div>
                  <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
                </div>
              ))}
            </div>

            {/* Feature list */}
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-semibold">Model Features in Dataset</div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {features.map((f: string) => (
                <div key={f} className="flex items-start gap-2.5 p-2 rounded border border-border/30 bg-muted/10">
                  <span className="font-mono text-[10px] text-blue-400 whitespace-nowrap flex-shrink-0">{f}</span>
                  <span className="text-[10px] text-muted-foreground leading-snug">
                    {featureDescriptions[f] ?? "Feature variable for model training"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* EDA */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              EDA Highlights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {useCase.orionContext.edaHighlights.map((h: string, i: number) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded bg-muted/20">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-[11px] text-muted-foreground">{h}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ─── PAGE: Experiments ─────────────────────────────────────────── */
function PageExperiments({ useCase, isClass, bestAlgo }: any) {
  const experiments = useCase.orionContext.algorithms.map((algo: string, i: number) => {
    const isBest = algo === bestAlgo;
    if (isClass) {
      const m = ALGO_METRICS_CLASS[algo] ?? ALGO_METRICS_CLASS.Default;
      const jitter = (i * 0.007 + (i % 2) * 0.003) * (i % 2 === 0 ? -1 : 1);
      return { id: `EXP-${String(i + 1).padStart(3, "0")}`, algo, isBest, status: "Completed", duration: `${14 + i * 6}m`, auc: (m.auc + jitter).toFixed(3), precision: (m.precision + jitter).toFixed(3), recall: (m.recall - jitter * 0.5).toFixed(3), f1: (m.f1 + jitter * 0.5).toFixed(3) };
    } else {
      const m = ALGO_METRICS_REG[algo] ?? ALGO_METRICS_REG.Default;
      const jitter = i * 40 + (i % 2) * 20;
      return { id: `EXP-${String(i + 1).padStart(3, "0")}`, algo, isBest, status: "Completed", duration: `${14 + i * 6}m`, rmse: Math.round(m.rmse + jitter), r2: (m.r2 - i * 0.008).toFixed(3), mape: (m.mape + i * 0.4).toFixed(1) };
    }
  });

  const chartData = experiments.map((e: any) => ({
    name: e.algo.split(" ")[0],
    value: isClass ? parseFloat(e.auc) : parseFloat(e.r2),
  }));

  return (
    <div className="space-y-4">
      {/* Summary metric chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            Algorithm Comparison — {isClass ? "AUC Score" : "R² Score"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="name" tick={tick} />
              <YAxis tick={tick} domain={[isClass ? 0.6 : 0.5, 1]} />
              <Tooltip contentStyle={tooltip} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                {chartData.map((_: any, i: number) => (
                  <Cell key={i} fill={experiments[i].isBest ? CHART_COLOR : "#ffffff30"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Experiment table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-muted-foreground" />
            Experiment Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="text-left py-2 text-[10px] text-muted-foreground uppercase tracking-wide font-medium">ID</th>
                  <th className="text-left py-2 text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Algorithm</th>
                  {isClass ? (
                    <>
                      <th className="text-right py-2 text-[10px] text-muted-foreground uppercase tracking-wide font-medium">AUC</th>
                      <th className="text-right py-2 text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Precision</th>
                      <th className="text-right py-2 text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Recall</th>
                      <th className="text-right py-2 text-[10px] text-muted-foreground uppercase tracking-wide font-medium">F1</th>
                    </>
                  ) : (
                    <>
                      <th className="text-right py-2 text-[10px] text-muted-foreground uppercase tracking-wide font-medium">RMSE</th>
                      <th className="text-right py-2 text-[10px] text-muted-foreground uppercase tracking-wide font-medium">R²</th>
                      <th className="text-right py-2 text-[10px] text-muted-foreground uppercase tracking-wide font-medium">MAPE %</th>
                    </>
                  )}
                  <th className="text-right py-2 text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Duration</th>
                  <th className="text-right py-2 text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {experiments.map((e: any) => (
                  <tr key={e.id} className={`border-b border-border/20 ${e.isBest ? "bg-yellow-500/5" : ""}`}>
                    <td className="py-2 font-mono text-muted-foreground">{e.id}</td>
                    <td className="py-2 font-medium flex items-center gap-1.5">
                      {e.isBest && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
                      <span style={{ color: e.isBest ? CHART_COLOR : undefined }}>{e.algo}</span>
                    </td>
                    {isClass ? (
                      <>
                        <td className="py-2 text-right font-semibold" style={{ color: e.isBest ? CHART_COLOR : undefined }}>{e.auc}</td>
                        <td className="py-2 text-right">{e.precision}</td>
                        <td className="py-2 text-right">{e.recall}</td>
                        <td className="py-2 text-right">{e.f1}</td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 text-right">{e.rmse}</td>
                        <td className="py-2 text-right font-semibold" style={{ color: e.isBest ? CHART_COLOR : undefined }}>{e.r2}</td>
                        <td className="py-2 text-right">{e.mape}%</td>
                      </>
                    )}
                    <td className="py-2 text-right text-muted-foreground">{e.duration}</td>
                    <td className="py-2 text-right"><Badge variant="outline" className="text-[9px]">Completed</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── PAGE: Deploy ──────────────────────────────────────────────── */
function PageDeploy({ useCase, isClass, bestAlgo }: any) {
  const metric = isClass ? ALGO_METRICS_CLASS[bestAlgo] ?? ALGO_METRICS_CLASS.Default : ALGO_METRICS_REG[bestAlgo] ?? ALGO_METRICS_REG.Default;
  const scoreData = isClass
    ? [{ range: "<0.2", count: 340 }, { range: "0.2-0.4", count: 280 }, { range: "0.4-0.6", count: 180 }, { range: "0.6-0.8", count: 120 }, { range: ">0.8", count: 80 }]
    : [{ range: "Q1", count: 240 }, { range: "Q2", count: 320 }, { range: "Q3", count: 280 }, { range: "Q4", count: 160 }];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Model Version", value: "v3.2.1", color: "text-foreground" },
          { label: isClass ? "AUC Score" : "R² Score", value: isClass ? (metric as any).auc?.toFixed(3) : (metric as any).r2?.toFixed(3), color: "text-yellow-400" },
          { label: "Status", value: "Active", color: "text-green-400" },
          { label: "Deployed", value: "Dec 01 2025", color: "text-muted-foreground" },
          { label: "Last Scored", value: "Today 06:00 AM", color: "text-blue-400" },
          { label: "Records Scored", value: "4,200 today", color: "text-muted-foreground" },
        ].map(item => (
          <div key={item.label} className="rounded-lg border border-border/40 p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</div>
            <div className={`text-sm font-semibold mt-1 ${item.color}`}>{item.value}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            Score Distribution (Latest Run)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={scoreData} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="range" tick={tick} />
              <YAxis tick={tick} />
              <Tooltip contentStyle={tooltip} />
              <Bar dataKey="count" fill={CHART_COLOR} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Cpu className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-semibold">Scoring Endpoint</span>
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">
          POST /api/v1/orion/{useCase.id}/score · Batch &amp; Real-time · Avg latency 42ms
        </div>
      </div>
    </div>
  );
}

/* ─── PAGE: Outcomes ────────────────────────────────────────────── */
function PageOutcomes({ useCase }: any) {
  const kpis = useCase.kpis.slice(0, 4);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((kpi: any) => (
          <div key={kpi.label} className="rounded-xl border border-border/40 p-4 bg-muted/10">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{kpi.label}</div>
            <div className="text-xl font-bold" style={{ color: CHART_COLOR }}>{kpi.value}</div>
            <div className="text-[10px] text-muted-foreground mt-1">{kpi.trend}</div>
          </div>
        ))}
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Target className="w-4 h-4 text-muted-foreground" />
            Model-Driven Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {useCase.businessTabs.map((tab: any, i: number) => (
            <div key={tab.label} className="flex items-start gap-3 p-3 rounded-lg border border-border/40">
              <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${["bg-green-500/15","bg-amber-500/15","bg-blue-500/15","bg-violet-500/15"][i]}`}>
                <TrendingUp className={`w-3.5 h-3.5 ${["text-green-400","text-amber-400","text-blue-400","text-violet-400"][i]}`} />
              </div>
              <div>
                <div className="text-xs font-semibold">{tab.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{tab.insightRows[0]?.label}: {tab.insightRows[0]?.value}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── PAGE: Governance ──────────────────────────────────────────── */
function PageGovernance({ useCase, bestAlgo }: any) {
  const auditLog = [
    { action: "Model Deployed", user: "DS Lead", date: "Dec 01 2025 09:14", status: "success" },
    { action: "Model Approved", user: "Risk Committee", date: "Nov 30 2025 16:40", status: "success" },
    { action: "Experiment Finalized", user: "DS Team", date: "Nov 28 2025 14:22", status: "success" },
    { action: "Data Quality Signed Off", user: "Data Governance", date: "Nov 25 2025 11:05", status: "success" },
    { action: "Challenger Model Rejected", user: "Model Risk", date: "Nov 22 2025 09:30", status: "warning" },
  ];
  const checks = [
    { label: "Fairness / Bias Audit", status: "Passed" },
    { label: "Data Lineage Verified", status: "Passed" },
    { label: "Regulatory Alignment (GDPR)", status: "Passed" },
    { label: "Model Documentation Complete", status: "Passed" },
    { label: "Challenger Comparison Done", status: "Passed" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              Audit Log
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {auditLog.map((entry, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2.5 rounded border border-border/30 bg-muted/10">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${entry.status === "success" ? "bg-green-400" : "bg-amber-400"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">{entry.action}</div>
                  <div className="text-[10px] text-muted-foreground">{entry.user} · {entry.date}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              Compliance Checks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {checks.map(c => (
              <div key={c.label} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                <span className="text-xs">{c.label}</span>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-[10px] text-green-400">{c.status}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Layers className="w-4 h-4 text-muted-foreground" />
            Model Lineage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            {[
              { label: "Raw Data", sub: "4 datasets" },
              { label: "Feature Store", sub: `${useCase.orionContext.features.length} features` },
              { label: "Training Run", sub: `${useCase.orionContext.algorithms.length} experiments` },
              { label: "Champion Model", sub: bestAlgo },
              { label: "Production Scoring", sub: "Active · v3.2.1" },
            ].map((node, i, arr) => (
              <div key={node.label} className="flex items-center gap-2">
                <div className="rounded-lg border border-border/50 px-3 py-2 bg-muted/20">
                  <div className="font-semibold">{node.label}</div>
                  <div className="text-[10px] text-muted-foreground">{node.sub}</div>
                </div>
                {i < arr.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── MAIN COMPONENT ────────────────────────────────────────────── */
const PAGE_META: Record<string, { label: string; icon: any }> = {
  overview: { label: "ML Overview", icon: BriefcaseBusiness },
  data: { label: "Data Hub", icon: Database },
  experiments: { label: "Experiment Lab", icon: FlaskConical },
  deploy: { label: "Deployment & Scoring", icon: Rocket },
  outcomes: { label: "Outcomes & Recommendations", icon: TrendingUp },
  governance: { label: "Governance & Audit", icon: Gavel },
};

export default function DemoOrionPage() {
  const { industry: industryId, useCase: useCaseId, page = "overview" } = useParams<{
    industry: string; useCase: string; page: string;
  }>();
  const [, navigate] = useLocation();

  const industry = getIndustry(industryId ?? "");
  const useCase = getUseCase(industryId ?? "", useCaseId ?? "");

  if (!useCase || !industry) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Use case not found.</div>;
  }

  const key = `${industryId}:${useCaseId}`;
  const datasets = DATASETS[key] ?? [
    { name: `${useCase.name} Training Dataset`, rows: "1.2M", cols: useCase.orionContext.features.length, quality: 92, updated: "Nov 30 2025", source: "Internal Systems" },
    { name: "Validation Dataset", rows: "240K", cols: useCase.orionContext.features.length, quality: 94, updated: "Nov 28 2025", source: "Internal Systems" },
  ];

  const classification = isClassification(useCase.orionContext.targetVariable);
  const bestAlgo = getBestAlgo(useCase, classification);
  const pageMeta = PAGE_META[page] ?? PAGE_META.overview;
  const PageIcon = pageMeta.icon;
  const baseUrl = `/demo/${industryId}/${useCaseId}`;

  const INDUSTRY_COLOR: Record<string, string> = {
    cpg: "#22c55e", retail: "#3b82f6", tmt: "#FFD822", bfsi: "#a855f7",
  };
  const icolor = INDUSTRY_COLOR[industryId ?? ""] ?? CHART_COLOR;

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <button onClick={() => navigate("/home")} className="hover:text-foreground transition-colors">ML Orion Platform</button>
          <ChevronRight className="w-3 h-3" />
          <button onClick={() => navigate(baseUrl)} className="hover:text-foreground transition-colors" style={{ color: icolor }}>{useCase.name}</button>
          <ChevronRight className="w-3 h-3" />
          <span>ML Orion</span>
          <ChevronRight className="w-3 h-3" />
          <span>{pageMeta.label}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: CHART_COLOR }}>
            <PageIcon className="w-4 h-4 text-black" />
          </div>
          <div>
            <h1 className="text-lg font-bold">{pageMeta.label}</h1>
            <p className="text-xs text-muted-foreground">{useCase.name} · {industry.name}</p>
          </div>
        </div>
      </div>

      {/* Page content */}
      {page === "overview" && <PageOverview useCase={useCase} isClass={classification} bestAlgo={bestAlgo} industryId={industryId} useCaseId={useCaseId} />}
      {page === "data" && <PageData useCase={useCase} datasets={datasets} industryId={industryId} useCaseId={useCaseId} />}
      {page === "experiments" && <PageExperiments useCase={useCase} isClass={classification} bestAlgo={bestAlgo} />}
      {page === "deploy" && <PageDeploy useCase={useCase} isClass={classification} bestAlgo={bestAlgo} />}
      {page === "outcomes" && <PageOutcomes useCase={useCase} />}
      {page === "governance" && <PageGovernance useCase={useCase} bestAlgo={bestAlgo} />}

    </div>
  );
}
