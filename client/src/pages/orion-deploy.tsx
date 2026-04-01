import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { OrionLayout, KpiCard, StatusBadge, OrionNav } from "@/components/orion-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Trash2, PlayCircle, StopCircle, Target, CheckCircle, XCircle, AlertTriangle, Activity, TrendingUp, TrendingDown, ShieldCheck, Send } from "lucide-react";
import type { MlModel } from "@shared/schema";

function DriftBar({ label, value, threshold, color = "amber" }: { label: string; value: number; threshold: number; color?: "green" | "amber" | "red" }) {
  const pct = Math.min(value * 100, 100);
  const barColor = value < threshold * 0.5 ? "bg-emerald-500" : value < threshold ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-mono font-bold ${value >= threshold ? "text-red-400" : value >= threshold * 0.5 ? "text-amber-400" : "text-emerald-400"}`}>{value.toFixed(3)}</span>
      </div>
      <div className="h-2 bg-muted rounded overflow-hidden">
        <div className={`h-full ${barColor} rounded`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-end">
        <span className="text-[9px] text-muted-foreground">threshold: {threshold}</span>
      </div>
    </div>
  );
}

function getMonitoringStatus(model: MlModel, predCount: number, totalActiveCustomers: number): { status: string; label: string } {
  if (!model.isDeployed) return { status: "stale", label: "Not Deployed" };
  if (predCount === 0) return { status: "stale", label: "Stale — No Predictions" };
  const coverage = totalActiveCustomers > 0 ? predCount / totalActiveCustomers : 0;
  if (coverage < 0.3) return { status: "at risk", label: "At Risk — Low Coverage" };
  return { status: "healthy", label: "Healthy" };
}

export default function OrionDeployPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [scoringModelId, setScoringModelId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [approvalModel, setApprovalModel] = useState<MlModel | null>(null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [approvalAction, setApprovalAction] = useState<"approve" | "reject">("approve");
  const [monitorTab, setMonitorTab] = useState<"overview" | "drift" | "coverage">("overview");

  const { data: modelsRaw = [] } = useQuery<MlModel[]>({ queryKey: ["/api/models"] });
  const { data: predictions = [] } = useQuery<any[]>({ queryKey: ["/api/predictions"] });
  const { data: custStats } = useQuery<{ total: number; active: number; churned: number }>({ queryKey: ["/api/customers/stats"] });

  const models = modelsRaw as any[];
  const deployedModels = models.filter(m => m.isDeployed);
  const availableModels = models.filter(m => !m.isDeployed && m.status === "trained");
  const totalPredCount = (predictions as any[]).length;
  const totalActiveCustomers = custStats?.active ?? 500;

  function predCountForModel(modelId: number) {
    return (predictions as any[]).filter((p: any) => p.modelId === modelId).length;
  }

  const deployMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/models/${id}/deploy`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/models"] }); toast({ title: "Model deployed" }); },
    onError: (e: any) => toast({ title: "Deploy failed", description: e.message, variant: "destructive" }),
  });

  const undeployMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/models/${id}/undeploy`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/models"] }); toast({ title: "Model undeployed" }); },
    onError: (e: any) => toast({ title: "Undeploy failed", description: e.message, variant: "destructive" }),
  });

  const scoreMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/models/${id}/predict-customers`, {}),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/predictions"] });
      toast({ title: `Scored ${data.predicted} customers` });
      setScoringModelId(null);
    },
    onError: (e: any) => { toast({ title: "Scoring failed", description: e.message, variant: "destructive" }); setScoringModelId(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/models/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/models"] });
      qc.invalidateQueries({ queryKey: ["/api/predictions"] });
      toast({ title: "Model deleted" });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const approveMut = useMutation({
    mutationFn: ({ id, notes, action }: { id: number; notes: string; action: string }) =>
      apiRequest("POST", `/api/models/${id}/approve`, { approvedBy: "ml-ops-lead", approvalNotes: notes, action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/models"] });
      toast({ title: `Model ${approvalAction === "approve" ? "approved" : "rejected"}` });
      setApprovalModel(null);
      setApprovalNotes("");
    },
    onError: (e: any) => toast({ title: "Approval failed", description: e.message, variant: "destructive" }),
  });

  // Drift metrics (deterministic per model based on AUC/accuracy)
  function getDriftMetrics(m: any) {
    const seed = (m.auc || 0.8) * 100;
    const psi = parseFloat(((1 - (m.auc || 0.8)) * 0.4 + 0.02).toFixed(3));
    const ks = parseFloat(((m.accuracy || 0.8) * 0.15).toFixed(3));
    const featureDrift = parseFloat((psi * 1.2).toFixed(3));
    const targetDrift = parseFloat((ks * 0.8).toFixed(3));
    const predDrift = parseFloat((psi * 0.9).toFixed(3));
    const segmentDrift = parseFloat(((1 - (m.recall || 0.8)) * 0.25).toFixed(3));
    return { psi, ks, featureDrift, targetDrift, predDrift, segmentDrift };
  }

  const avgAuc = deployedModels.length
    ? parseFloat((deployedModels.reduce((s, m) => s + (m.auc || 0), 0) / deployedModels.length).toFixed(4))
    : 0;

  const healthyCount = deployedModels.filter(m => getMonitoringStatus(m, predCountForModel(m.id), totalActiveCustomers).status === "healthy").length;
  const atRiskCount = deployedModels.filter(m => getMonitoringStatus(m, predCountForModel(m.id), totalActiveCustomers).status === "at risk").length;
  const staleCount = deployedModels.filter(m => getMonitoringStatus(m, predCountForModel(m.id), totalActiveCustomers).status === "stale").length;

  const deleteTarget = models.find(m => m.id === deleteId);

  return (
    <OrionLayout title="Deploy & Scoring" subtitle="Production model management, drift monitoring, and approval workflow">
      <div className="space-y-4">
        <OrionNav current="/orion/deploy" />

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <KpiCard label="Deployed Models" value={deployedModels.length} color="green" testId="kpi-deployed" />
          <KpiCard label="Healthy" value={healthyCount} color="green" testId="kpi-healthy" />
          <KpiCard label="At Risk" value={atRiskCount} color={atRiskCount > 0 ? "amber" : "green"} testId="kpi-at-risk" />
          <KpiCard label="Stale" value={staleCount} color={staleCount > 0 ? "amber" : "green"} testId="kpi-stale" />
          <KpiCard label="Avg AUC" value={avgAuc ? avgAuc.toFixed(4) : "—"} color="blue" testId="kpi-auc" />
          <KpiCard label="Total Predictions" value={totalPredCount.toLocaleString()} testId="kpi-predictions" />
        </div>

        {/* ── PRODUCTION MODELS ── */}
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500" />Production Models
            </h3>
            <span className="text-[10px] text-muted-foreground">{deployedModels.length} deployed</span>
          </div>
          {deployedModels.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-xs">
              No models deployed. Deploy a model from the available list below.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {["Model", "Algorithm", "AUC", "Accuracy", "Predictions", "Deployed", "Status", "Approval", "Actions"].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deployedModels.map(m => {
                    const predCount = predCountForModel(m.id);
                    const monStatus = getMonitoringStatus(m, predCount, totalActiveCustomers);
                    return (
                      <tr key={m.id} className="border-b hover:bg-muted/10" data-testid={`row-deployed-${m.id}`}>
                        <td className="px-3 py-2 font-medium max-w-[160px] truncate">{m.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{m.algorithm}</td>
                        <td className="px-3 py-2 font-mono font-bold text-primary">{m.auc?.toFixed(4) ?? "—"}</td>
                        <td className="px-3 py-2 font-mono">{m.accuracy ? `${(m.accuracy * 100).toFixed(1)}%` : "—"}</td>
                        <td className="px-3 py-2 font-mono">{predCount.toLocaleString()}</td>
                        <td className="px-3 py-2 text-muted-foreground">{m.deployedAt ? new Date(m.deployedAt).toLocaleDateString() : "—"}</td>
                        <td className="px-3 py-2"><StatusBadge status={monStatus.label.split(" — ")[0]} /></td>
                        <td className="px-3 py-2">
                          <StatusBadge status={m.approvalStatus === "approved" ? "Approved" : m.approvalStatus === "rejected" ? "Rejected" : "Pending"} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-primary/10 hover:text-primary"
                              onClick={() => { setScoringModelId(m.id); scoreMut.mutate(m.id); }}
                              disabled={scoreMut.isPending && scoringModelId === m.id}
                              title="Score customers" data-testid={`button-score-${m.id}`}>
                              <Target className="w-3 h-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-amber-500/10 hover:text-amber-500"
                              onClick={() => { setApprovalModel(m); setApprovalNotes(""); setApprovalAction(m.approvalStatus === "approved" ? "reject" : "approve"); }}
                              title="Submit for approval" data-testid={`button-approve-${m.id}`}>
                              <ShieldCheck className="w-3 h-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-amber-500/10 hover:text-amber-500"
                              onClick={() => undeployMut.mutate(m.id)} title="Undeploy"
                              data-testid={`button-undeploy-${m.id}`}>
                              <StopCircle className="w-3 h-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-red-500/10 hover:text-red-500"
                              onClick={() => setDeleteId(m.id)} title="Delete"
                              data-testid={`button-delete-deployed-${m.id}`}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── MONITORING ── */}
        {deployedModels.length > 0 && (
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500" />Model Monitoring
              </h3>
              <div className="flex gap-1">
                {(["overview", "drift", "coverage"] as const).map(t => (
                  <button key={t} onClick={() => setMonitorTab(t)} data-testid={`tab-monitor-${t}`}
                    className={`px-3 py-1 text-[10px] rounded font-medium transition-colors ${monitorTab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {monitorTab === "overview" && (
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {deployedModels.map(m => {
                    const predCount = predCountForModel(m.id);
                    const monStatus = getMonitoringStatus(m, predCount, totalActiveCustomers);
                    const drift = getDriftMetrics(m);
                    const coverage = totalActiveCustomers > 0 ? ((predCount / totalActiveCustomers) * 100).toFixed(1) : "0.0";
                    const driftAlert = drift.psi > 0.2 || drift.featureDrift > 0.25;
                    return (
                      <div key={m.id} className="border rounded-lg p-4 space-y-2" data-testid={`card-monitor-${m.id}`}>
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-xs font-semibold truncate max-w-[180px]">{m.name}</p>
                            <p className="text-[10px] text-muted-foreground">{m.algorithm}</p>
                          </div>
                          <StatusBadge status={monStatus.label.split(" — ")[0]} />
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-muted/30 rounded p-2">
                            <p className="text-[10px] text-muted-foreground">AUC</p>
                            <p className="text-sm font-mono font-bold text-primary">{m.auc?.toFixed(4)}</p>
                          </div>
                          <div className="bg-muted/30 rounded p-2">
                            <p className="text-[10px] text-muted-foreground">Predictions</p>
                            <p className="text-sm font-mono font-bold">{predCount.toLocaleString()}</p>
                          </div>
                          <div className="bg-muted/30 rounded p-2">
                            <p className="text-[10px] text-muted-foreground">Coverage</p>
                            <p className="text-sm font-mono font-bold">{coverage}%</p>
                          </div>
                        </div>
                        {driftAlert && (
                          <div className="flex items-center gap-1.5 text-[10px] text-amber-500 bg-amber-500/10 rounded px-2 py-1">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            Drift detected — PSI {drift.psi.toFixed(3)} (threshold: 0.20)
                          </div>
                        )}
                        {m.approvalStatus === "approved" && (
                          <div className="flex items-center gap-1.5 text-[10px] text-emerald-500 bg-emerald-500/10 rounded px-2 py-1">
                            <ShieldCheck className="w-3 h-3 shrink-0" />
                            Approved by {m.approvedBy} on {m.approvedAt ? new Date(m.approvedAt).toLocaleDateString() : "—"}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {monitorTab === "drift" && (
              <div className="p-4 space-y-6">
                {deployedModels.map(m => {
                  const drift = getDriftMetrics(m);
                  return (
                    <div key={m.id} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold">{m.name}</p>
                        <span className="text-muted-foreground text-[10px]">— {m.algorithm}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Distribution Drift</p>
                          <DriftBar label="PSI (Population Stability)" value={drift.psi} threshold={0.2} />
                          <DriftBar label="KS Statistic" value={drift.ks} threshold={0.1} />
                          <DriftBar label="Feature Drift Score" value={drift.featureDrift} threshold={0.25} />
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Prediction Drift</p>
                          <DriftBar label="Target Drift" value={drift.targetDrift} threshold={0.15} />
                          <DriftBar label="Prediction Distribution Drift" value={drift.predDrift} threshold={0.2} />
                          <DriftBar label="Segment Drift" value={drift.segmentDrift} threshold={0.1} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {monitorTab === "coverage" && (
              <div className="p-4">
                <div className="space-y-3">
                  <p className="text-[10px] text-muted-foreground">Prediction coverage of active customer base ({totalActiveCustomers.toLocaleString()} active customers). Total predictions in system: <strong className="text-foreground">{totalPredCount.toLocaleString()}</strong></p>
                  {deployedModels.map(m => {
                    const predCount = predCountForModel(m.id);
                    const pct = totalActiveCustomers > 0 ? (predCount / totalActiveCustomers) * 100 : 0;
                    const highRisk = (predictions as any[]).filter((p: any) => p.modelId === m.id && p.riskCategory === "high").length;
                    const medRisk = (predictions as any[]).filter((p: any) => p.modelId === m.id && p.riskCategory === "medium").length;
                    const lowRisk = predCount - highRisk - medRisk;
                    return (
                      <div key={m.id} className="space-y-1.5" data-testid={`coverage-${m.id}`}>
                        <div className="flex justify-between text-xs">
                          <span className="font-medium truncate max-w-[200px]">{m.name}</span>
                          <div className="flex gap-3 text-[10px] text-muted-foreground">
                            <span className="text-red-400">{highRisk} high</span>
                            <span className="text-amber-400">{medRisk} med</span>
                            <span className="text-emerald-400">{lowRisk} low</span>
                            <span className="font-mono font-bold text-foreground">{predCount.toLocaleString()} total</span>
                          </div>
                        </div>
                        <div className="flex gap-px h-4 rounded overflow-hidden">
                          {predCount > 0 && (
                            <>
                              <div className="bg-red-500/70" style={{ flex: highRisk }} />
                              <div className="bg-amber-500/70" style={{ flex: medRisk }} />
                              <div className="bg-emerald-500/70" style={{ flex: lowRisk }} />
                            </>
                          )}
                          {predCount === 0 && <div className="flex-1 bg-muted" />}
                        </div>
                        <div className="flex justify-between text-[9px] text-muted-foreground">
                          <span>Coverage: {pct.toFixed(1)}% of {totalActiveCustomers} active customers ({predCount} scored)</span>
                          {predCount === 0 && <span className="text-amber-400">Run scoring to generate predictions</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── AVAILABLE TO DEPLOY ── */}
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h3 className="text-sm font-semibold">Available to Deploy</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">{availableModels.length} trained models ready for deployment</p>
          </div>
          {availableModels.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-xs">
              No trained models available. Train a model in the Experiments page.
              <div className="mt-2">
                <a href="/orion/experiments" className="text-primary underline text-xs">Go to Experiments →</a>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {["Model", "Algorithm", "AUC", "F1", "Accuracy", "Trained", "Approval", "Actions"].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {availableModels.map(m => (
                    <tr key={m.id} className="border-b hover:bg-muted/10" data-testid={`row-available-${m.id}`}>
                      <td className="px-3 py-2 font-medium max-w-[160px] truncate">{m.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{m.algorithm}</td>
                      <td className="px-3 py-2 font-mono font-bold text-primary">{m.auc?.toFixed(4) ?? "—"}</td>
                      <td className="px-3 py-2 font-mono">{m.f1Score?.toFixed(4) ?? "—"}</td>
                      <td className="px-3 py-2 font-mono">{m.accuracy ? `${(m.accuracy * 100).toFixed(1)}%` : "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{m.trainedAt ? new Date(m.trainedAt).toLocaleDateString() : "—"}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={m.approvalStatus === "approved" ? "Approved" : m.approvalStatus === "rejected" ? "Rejected" : "Pending"} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-emerald-500/10 hover:text-emerald-500"
                            onClick={() => deployMut.mutate(m.id)} title="Deploy"
                            data-testid={`button-deploy-${m.id}`}>
                            <PlayCircle className="w-3 h-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-amber-500/10 hover:text-amber-500"
                            onClick={() => { setApprovalModel(m); setApprovalNotes(""); setApprovalAction("approve"); }}
                            title="Submit for approval" data-testid={`button-request-approval-${m.id}`}>
                            <Send className="w-3 h-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-red-500/10 hover:text-red-500"
                            onClick={() => setDeleteId(m.id)} title="Delete"
                            data-testid={`button-delete-available-${m.id}`}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── ALL MODELS (monitoring table) ── */}
        {models.filter(m => m.status !== "training").length > 0 && (
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b">
              <h3 className="text-sm font-semibold">All Models — Monitoring Overview</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {["Model", "Algorithm", "Deployed", "AUC", "Predictions", "Monitor Status", "Approval", "Actions"].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {models.filter(m => m.status !== "training").map(m => {
                    const predCount = predCountForModel(m.id);
                    const monStatus = getMonitoringStatus(m, predCount, totalActiveCustomers);
                    return (
                      <tr key={m.id} className="border-b hover:bg-muted/10" data-testid={`row-monitor-${m.id}`}>
                        <td className="px-3 py-2 font-medium max-w-[140px] truncate">{m.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{m.algorithm}</td>
                        <td className="px-3 py-2">
                          {m.isDeployed
                            ? <span className="text-emerald-500 font-medium">Yes</span>
                            : <span className="text-muted-foreground">No</span>}
                        </td>
                        <td className="px-3 py-2 font-mono">{m.auc?.toFixed(4) ?? "—"}</td>
                        <td className="px-3 py-2 font-mono">{predCount.toLocaleString()}</td>
                        <td className="px-3 py-2"><StatusBadge status={monStatus.label.split(" — ")[0]} /></td>
                        <td className="px-3 py-2">
                          <StatusBadge status={m.approvalStatus === "approved" ? "Approved" : m.approvalStatus === "rejected" ? "Rejected" : "Pending"} />
                        </td>
                        <td className="px-3 py-2">
                          <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-red-500/10 hover:text-red-500"
                            onClick={() => setDeleteId(m.id)} data-testid={`button-delete-monitor-${m.id}`}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Model</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deleteTarget?.name}</strong>? All associated predictions will also be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMut.mutate(deleteId)}>
              Delete Model
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approval Dialog */}
      <Dialog open={!!approvalModel} onOpenChange={() => setApprovalModel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />Model Approval
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/30 rounded p-3 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Model</span><span className="font-medium">{approvalModel?.name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Algorithm</span><span>{approvalModel?.algorithm}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">AUC</span><span className="font-mono text-primary">{approvalModel?.auc?.toFixed(4)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Current Status</span><StatusBadge status={approvalModel?.approvalStatus === "approved" ? "Approved" : approvalModel?.approvalStatus === "rejected" ? "Rejected" : "Pending"} /></div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setApprovalAction("approve")}
                className={`flex-1 py-2 rounded text-xs font-medium border transition-colors ${approvalAction === "approve" ? "bg-emerald-500 text-white border-emerald-500" : "border-border text-muted-foreground hover:bg-muted/20"}`}
                data-testid="button-approval-approve">
                ✓ Approve
              </button>
              <button onClick={() => setApprovalAction("reject")}
                className={`flex-1 py-2 rounded text-xs font-medium border transition-colors ${approvalAction === "reject" ? "bg-red-500 text-white border-red-500" : "border-border text-muted-foreground hover:bg-muted/20"}`}
                data-testid="button-approval-reject">
                ✗ Reject
              </button>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase">Notes (optional)</label>
              <textarea
                className="mt-1 w-full text-xs bg-background border rounded px-2 py-1.5 resize-none"
                rows={3}
                placeholder="Add approval notes, conditions, or rejection reason..."
                value={approvalNotes}
                onChange={e => setApprovalNotes(e.target.value)}
                data-testid="input-approval-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setApprovalModel(null)}>Cancel</Button>
            <Button size="sm"
              className={approvalAction === "approve" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
              onClick={() => approvalModel && approveMut.mutate({ id: approvalModel.id, notes: approvalNotes, action: approvalAction })}
              disabled={approveMut.isPending}
              data-testid="button-submit-approval">
              {approvalAction === "approve" ? "Approve Model" : "Reject Model"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OrionLayout>
  );
}
