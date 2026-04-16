// import { useState } from "react";
// import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// import { apiRequest } from "@/lib/queryClient";
// import { OrionLayout, KpiCard, StatusBadge, OrionNav } from "@/components/orion-layout";
// import { Button } from "@/components/ui/button";
// import { Badge } from "@/components/ui/badge";
// import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
// import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
// import { useToast } from "@/hooks/use-toast";
// import { Trash2, PlayCircle, StopCircle, Target, CheckCircle, XCircle, AlertTriangle, Activity, TrendingUp, TrendingDown, ShieldCheck, Send } from "lucide-react";
// import type { MlModel } from "@shared/schema";

// function DriftBar({ label, value, threshold, color = "amber" }: { label: string; value: number; threshold: number; color?: "green" | "amber" | "red" }) {
//   const pct = Math.min(value * 100, 100);
//   const barColor = value < threshold * 0.5 ? "bg-emerald-500" : value < threshold ? "bg-amber-500" : "bg-red-500";
//   return (
//     <div className="space-y-0.5">
//       <div className="flex justify-between text-[10px]">
//         <span className="text-muted-foreground">{label}</span>
//         <span className={`font-mono font-bold ${value >= threshold ? "text-red-400" : value >= threshold * 0.5 ? "text-amber-400" : "text-emerald-400"}`}>{value.toFixed(3)}</span>
//       </div>
//       <div className="h-2 bg-muted rounded overflow-hidden">
//         <div className={`h-full ${barColor} rounded`} style={{ width: `${pct}%` }} />
//       </div>
//       <div className="flex justify-end">
//         <span className="text-[9px] text-muted-foreground">threshold: {threshold}</span>
//       </div>
//     </div>
//   );
// }

// function getMonitoringStatus(model: MlModel, predCount: number, totalActiveCustomers: number): { status: string; label: string } {
//   if (!model.isDeployed) return { status: "stale", label: "Not Deployed" };
//   if (predCount === 0) return { status: "stale", label: "Stale — No Predictions" };
//   const coverage = totalActiveCustomers > 0 ? predCount / totalActiveCustomers : 0;
//   if (coverage < 0.3) return { status: "at risk", label: "At Risk — Low Coverage" };
//   return { status: "healthy", label: "Healthy" };
// }

// export default function OrionDeployPage() {
//   const qc = useQueryClient();
//   const { toast } = useToast();
//   const [scoringModelId, setScoringModelId] = useState<number | null>(null);
//   const [deleteId, setDeleteId] = useState<number | null>(null);
//   const [approvalModel, setApprovalModel] = useState<MlModel | null>(null);
//   const [approvalNotes, setApprovalNotes] = useState("");
//   const [approvalAction, setApprovalAction] = useState<"approve" | "reject">("approve");
//   const [monitorTab, setMonitorTab] = useState<"overview" | "drift" | "coverage">("overview");

//   const { data: modelsRaw = [] } = useQuery<MlModel[]>({ queryKey: ["/api/models"] });
//   const { data: predictions = [] } = useQuery<any[]>({ queryKey: ["/api/predictions"] });
//   const { data: custStats } = useQuery<{ total: number; active: number; churned: number }>({ queryKey: ["/api/customers/stats"] });

//   const models = modelsRaw as any[];
//   const deployedModels = models.filter(m => m.isDeployed);
//   const availableModels = models.filter(m => !m.isDeployed && m.status === "trained");
//   const totalPredCount = (predictions as any[]).length;
//   const totalActiveCustomers = custStats?.active ?? 500;

//   function predCountForModel(modelId: number) {
//     return (predictions as any[]).filter((p: any) => p.modelId === modelId).length;
//   }

//   const deployMut = useMutation({
//     mutationFn: (id: number) => apiRequest("POST", `/api/models/${id}/deploy`, {}),
//     onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/models"] }); toast({ title: "Model deployed" }); },
//     onError: (e: any) => toast({ title: "Deploy failed", description: e.message, variant: "destructive" }),
//   });

//   const undeployMut = useMutation({
//     mutationFn: (id: number) => apiRequest("POST", `/api/models/${id}/undeploy`, {}),
//     onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/models"] }); toast({ title: "Model undeployed" }); },
//     onError: (e: any) => toast({ title: "Undeploy failed", description: e.message, variant: "destructive" }),
//   });

//   const scoreMut = useMutation({
//     mutationFn: (id: number) => apiRequest("POST", `/api/models/${id}/predict-customers`, {}),
//     onSuccess: (data: any) => {
//       qc.invalidateQueries({ queryKey: ["/api/predictions"] });
//       toast({ title: `Scored ${data.predicted} customers` });
//       setScoringModelId(null);
//     },
//     onError: (e: any) => { toast({ title: "Scoring failed", description: e.message, variant: "destructive" }); setScoringModelId(null); },
//   });

//   const deleteMut = useMutation({
//     mutationFn: (id: number) => apiRequest("DELETE", `/api/models/${id}`),
//     onSuccess: () => {
//       qc.invalidateQueries({ queryKey: ["/api/models"] });
//       qc.invalidateQueries({ queryKey: ["/api/predictions"] });
//       toast({ title: "Model deleted" });
//       setDeleteId(null);
//     },
//     onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
//   });

//   const approveMut = useMutation({
//     mutationFn: ({ id, notes, action }: { id: number; notes: string; action: string }) =>
//       apiRequest("POST", `/api/models/${id}/approve`, { approvedBy: "ml-ops-lead", approvalNotes: notes, action }),
//     onSuccess: () => {
//       qc.invalidateQueries({ queryKey: ["/api/models"] });
//       toast({ title: `Model ${approvalAction === "approve" ? "approved" : "rejected"}` });
//       setApprovalModel(null);
//       setApprovalNotes("");
//     },
//     onError: (e: any) => toast({ title: "Approval failed", description: e.message, variant: "destructive" }),
//   });

//   // Drift metrics (deterministic per model based on AUC/accuracy)
//   function getDriftMetrics(m: any) {
//     const seed = (m.auc || 0.8) * 100;
//     const psi = parseFloat(((1 - (m.auc || 0.8)) * 0.4 + 0.02).toFixed(3));
//     const ks = parseFloat(((m.accuracy || 0.8) * 0.15).toFixed(3));
//     const featureDrift = parseFloat((psi * 1.2).toFixed(3));
//     const targetDrift = parseFloat((ks * 0.8).toFixed(3));
//     const predDrift = parseFloat((psi * 0.9).toFixed(3));
//     const segmentDrift = parseFloat(((1 - (m.recall || 0.8)) * 0.25).toFixed(3));
//     return { psi, ks, featureDrift, targetDrift, predDrift, segmentDrift };
//   }

//   const avgAuc = deployedModels.length
//     ? parseFloat((deployedModels.reduce((s, m) => s + (m.auc || 0), 0) / deployedModels.length).toFixed(4))
//     : 0;

//   const healthyCount = deployedModels.filter(m => getMonitoringStatus(m, predCountForModel(m.id), totalActiveCustomers).status === "healthy").length;
//   const atRiskCount = deployedModels.filter(m => getMonitoringStatus(m, predCountForModel(m.id), totalActiveCustomers).status === "at risk").length;
//   const staleCount = deployedModels.filter(m => getMonitoringStatus(m, predCountForModel(m.id), totalActiveCustomers).status === "stale").length;

//   const deleteTarget = models.find(m => m.id === deleteId);

//   return (
//     <OrionLayout title="Deploy & Scoring" subtitle="Production model management, drift monitoring, and approval workflow">
//       <div className="space-y-4">
//         <OrionNav current="/orion/deploy" />

//         {/* KPI Row */}
//         <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
//           <KpiCard label="Deployed Models" value={deployedModels.length} color="green" testId="kpi-deployed" />
//           <KpiCard label="Healthy" value={healthyCount} color="green" testId="kpi-healthy" />
//           <KpiCard label="At Risk" value={atRiskCount} color={atRiskCount > 0 ? "amber" : "green"} testId="kpi-at-risk" />
//           <KpiCard label="Stale" value={staleCount} color={staleCount > 0 ? "amber" : "green"} testId="kpi-stale" />
//           <KpiCard label="Avg AUC" value={avgAuc ? avgAuc.toFixed(4) : "—"} color="blue" testId="kpi-auc" />
//           <KpiCard label="Total Predictions" value={totalPredCount.toLocaleString()} testId="kpi-predictions" />
//         </div>

//         {/* ── PRODUCTION MODELS ── */}
//         <div className="bg-card border rounded-lg overflow-hidden">
//           <div className="px-4 py-3 border-b flex items-center justify-between">
//             <h3 className="text-sm font-semibold flex items-center gap-2">
//               <CheckCircle className="w-4 h-4 text-emerald-500" />Production Models
//             </h3>
//             <span className="text-[10px] text-muted-foreground">{deployedModels.length} deployed</span>
//           </div>
//           {deployedModels.length === 0 ? (
//             <div className="p-8 text-center text-muted-foreground text-xs">
//               No models deployed. Deploy a model from the available list below.
//             </div>
//           ) : (
//             <div className="overflow-x-auto">
//               <table className="w-full text-xs">
//                 <thead>
//                   <tr className="border-b bg-muted/30">
//                     {["Model", "Algorithm", "AUC", "Accuracy", "Predictions", "Deployed", "Status", "Approval", "Actions"].map(h => (
//                       <th key={h} className="text-left px-3 py-2 text-muted-foreground font-medium">{h}</th>
//                     ))}
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {deployedModels.map(m => {
//                     const predCount = predCountForModel(m.id);
//                     const monStatus = getMonitoringStatus(m, predCount, totalActiveCustomers);
//                     return (
//                       <tr key={m.id} className="border-b hover:bg-muted/10" data-testid={`row-deployed-${m.id}`}>
//                         <td className="px-3 py-2 font-medium max-w-[160px] truncate">{m.name}</td>
//                         <td className="px-3 py-2 text-muted-foreground">{m.algorithm}</td>
//                         <td className="px-3 py-2 font-mono font-bold text-primary">{m.auc?.toFixed(4) ?? "—"}</td>
//                         <td className="px-3 py-2 font-mono">{m.accuracy ? `${(m.accuracy * 100).toFixed(1)}%` : "—"}</td>
//                         <td className="px-3 py-2 font-mono">{predCount.toLocaleString()}</td>
//                         <td className="px-3 py-2 text-muted-foreground">{m.deployedAt ? new Date(m.deployedAt).toLocaleDateString() : "—"}</td>
//                         <td className="px-3 py-2"><StatusBadge status={monStatus.label.split(" — ")[0]} /></td>
//                         <td className="px-3 py-2">
//                           <StatusBadge status={m.approvalStatus === "approved" ? "Approved" : m.approvalStatus === "rejected" ? "Rejected" : "Pending"} />
//                         </td>
//                         <td className="px-3 py-2">
//                           <div className="flex items-center gap-1">
//                             <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-primary/10 hover:text-primary"
//                               onClick={() => { setScoringModelId(m.id); scoreMut.mutate(m.id); }}
//                               disabled={scoreMut.isPending && scoringModelId === m.id}
//                               title="Score customers" data-testid={`button-score-${m.id}`}>
//                               <Target className="w-3 h-3" />
//                             </Button>
//                             <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-amber-500/10 hover:text-amber-500"
//                               onClick={() => { setApprovalModel(m); setApprovalNotes(""); setApprovalAction(m.approvalStatus === "approved" ? "reject" : "approve"); }}
//                               title="Submit for approval" data-testid={`button-approve-${m.id}`}>
//                               <ShieldCheck className="w-3 h-3" />
//                             </Button>
//                             <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-amber-500/10 hover:text-amber-500"
//                               onClick={() => undeployMut.mutate(m.id)} title="Undeploy"
//                               data-testid={`button-undeploy-${m.id}`}>
//                               <StopCircle className="w-3 h-3" />
//                             </Button>
//                             <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-red-500/10 hover:text-red-500"
//                               onClick={() => setDeleteId(m.id)} title="Delete"
//                               data-testid={`button-delete-deployed-${m.id}`}>
//                               <Trash2 className="w-3 h-3" />
//                             </Button>
//                           </div>
//                         </td>
//                       </tr>
//                     );
//                   })}
//                 </tbody>
//               </table>
//             </div>
//           )}
//         </div>

//         {/* ── MONITORING ── */}
//         {deployedModels.length > 0 && (
//           <div className="bg-card border rounded-lg overflow-hidden">
//             <div className="px-4 py-3 border-b flex items-center justify-between">
//               <h3 className="text-sm font-semibold flex items-center gap-2">
//                 <Activity className="w-4 h-4 text-blue-500" />Model Monitoring
//               </h3>
//               <div className="flex gap-1">
//                 {(["overview", "drift", "coverage"] as const).map(t => (
//                   <button key={t} onClick={() => setMonitorTab(t)} data-testid={`tab-monitor-${t}`}
//                     className={`px-3 py-1 text-[10px] rounded font-medium transition-colors ${monitorTab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
//                     {t.charAt(0).toUpperCase() + t.slice(1)}
//                   </button>
//                 ))}
//               </div>
//             </div>

//             {monitorTab === "overview" && (
//               <div className="p-4">
//                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                   {deployedModels.map(m => {
//                     const predCount = predCountForModel(m.id);
//                     const monStatus = getMonitoringStatus(m, predCount, totalActiveCustomers);
//                     const drift = getDriftMetrics(m);
//                     const coverage = totalActiveCustomers > 0 ? ((predCount / totalActiveCustomers) * 100).toFixed(1) : "0.0";
//                     const driftAlert = drift.psi > 0.2 || drift.featureDrift > 0.25;
//                     return (
//                       <div key={m.id} className="border rounded-lg p-4 space-y-2" data-testid={`card-monitor-${m.id}`}>
//                         <div className="flex items-start justify-between">
//                           <div>
//                             <p className="text-xs font-semibold truncate max-w-[180px]">{m.name}</p>
//                             <p className="text-[10px] text-muted-foreground">{m.algorithm}</p>
//                           </div>
//                           <StatusBadge status={monStatus.label.split(" — ")[0]} />
//                         </div>
//                         <div className="grid grid-cols-3 gap-2 text-center">
//                           <div className="bg-muted/30 rounded p-2">
//                             <p className="text-[10px] text-muted-foreground">AUC</p>
//                             <p className="text-sm font-mono font-bold text-primary">{m.auc?.toFixed(4)}</p>
//                           </div>
//                           <div className="bg-muted/30 rounded p-2">
//                             <p className="text-[10px] text-muted-foreground">Predictions</p>
//                             <p className="text-sm font-mono font-bold">{predCount.toLocaleString()}</p>
//                           </div>
//                           <div className="bg-muted/30 rounded p-2">
//                             <p className="text-[10px] text-muted-foreground">Coverage</p>
//                             <p className="text-sm font-mono font-bold">{coverage}%</p>
//                           </div>
//                         </div>
//                         {driftAlert && (
//                           <div className="flex items-center gap-1.5 text-[10px] text-amber-500 bg-amber-500/10 rounded px-2 py-1">
//                             <AlertTriangle className="w-3 h-3 shrink-0" />
//                             Drift detected — PSI {drift.psi.toFixed(3)} (threshold: 0.20)
//                           </div>
//                         )}
//                         {m.approvalStatus === "approved" && (
//                           <div className="flex items-center gap-1.5 text-[10px] text-emerald-500 bg-emerald-500/10 rounded px-2 py-1">
//                             <ShieldCheck className="w-3 h-3 shrink-0" />
//                             Approved by {m.approvedBy} on {m.approvedAt ? new Date(m.approvedAt).toLocaleDateString() : "—"}
//                           </div>
//                         )}
//                       </div>
//                     );
//                   })}
//                 </div>
//               </div>
//             )}

//             {monitorTab === "drift" && (
//               <div className="p-4 space-y-6">
//                 {deployedModels.map(m => {
//                   const drift = getDriftMetrics(m);
//                   return (
//                     <div key={m.id} className="space-y-3">
//                       <div className="flex items-center gap-2">
//                         <p className="text-xs font-semibold">{m.name}</p>
//                         <span className="text-muted-foreground text-[10px]">— {m.algorithm}</span>
//                       </div>
//                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                         <div className="space-y-2">
//                           <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Distribution Drift</p>
//                           <DriftBar label="PSI (Population Stability)" value={drift.psi} threshold={0.2} />
//                           <DriftBar label="KS Statistic" value={drift.ks} threshold={0.1} />
//                           <DriftBar label="Feature Drift Score" value={drift.featureDrift} threshold={0.25} />
//                         </div>
//                         <div className="space-y-2">
//                           <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Prediction Drift</p>
//                           <DriftBar label="Target Drift" value={drift.targetDrift} threshold={0.15} />
//                           <DriftBar label="Prediction Distribution Drift" value={drift.predDrift} threshold={0.2} />
//                           <DriftBar label="Segment Drift" value={drift.segmentDrift} threshold={0.1} />
//                         </div>
//                       </div>
//                     </div>
//                   );
//                 })}
//               </div>
//             )}

//             {monitorTab === "coverage" && (
//               <div className="p-4">
//                 <div className="space-y-3">
//                   <p className="text-[10px] text-muted-foreground">Prediction coverage of active customer base ({totalActiveCustomers.toLocaleString()} active customers). Total predictions in system: <strong className="text-foreground">{totalPredCount.toLocaleString()}</strong></p>
//                   {deployedModels.map(m => {
//                     const predCount = predCountForModel(m.id);
//                     const pct = totalActiveCustomers > 0 ? (predCount / totalActiveCustomers) * 100 : 0;
//                     const highRisk = (predictions as any[]).filter((p: any) => p.modelId === m.id && p.riskCategory === "high").length;
//                     const medRisk = (predictions as any[]).filter((p: any) => p.modelId === m.id && p.riskCategory === "medium").length;
//                     const lowRisk = predCount - highRisk - medRisk;
//                     return (
//                       <div key={m.id} className="space-y-1.5" data-testid={`coverage-${m.id}`}>
//                         <div className="flex justify-between text-xs">
//                           <span className="font-medium truncate max-w-[200px]">{m.name}</span>
//                           <div className="flex gap-3 text-[10px] text-muted-foreground">
//                             <span className="text-red-400">{highRisk} high</span>
//                             <span className="text-amber-400">{medRisk} med</span>
//                             <span className="text-emerald-400">{lowRisk} low</span>
//                             <span className="font-mono font-bold text-foreground">{predCount.toLocaleString()} total</span>
//                           </div>
//                         </div>
//                         <div className="flex gap-px h-4 rounded overflow-hidden">
//                           {predCount > 0 && (
//                             <>
//                               <div className="bg-red-500/70" style={{ flex: highRisk }} />
//                               <div className="bg-amber-500/70" style={{ flex: medRisk }} />
//                               <div className="bg-emerald-500/70" style={{ flex: lowRisk }} />
//                             </>
//                           )}
//                           {predCount === 0 && <div className="flex-1 bg-muted" />}
//                         </div>
//                         <div className="flex justify-between text-[9px] text-muted-foreground">
//                           <span>Coverage: {pct.toFixed(1)}% of {totalActiveCustomers} active customers ({predCount} scored)</span>
//                           {predCount === 0 && <span className="text-amber-400">Run scoring to generate predictions</span>}
//                         </div>
//                       </div>
//                     );
//                   })}
//                 </div>
//               </div>
//             )}
//           </div>
//         )}

//         {/* ── AVAILABLE TO DEPLOY ── */}
//         <div className="bg-card border rounded-lg overflow-hidden">
//           <div className="px-4 py-3 border-b">
//             <h3 className="text-sm font-semibold">Available to Deploy</h3>
//             <p className="text-[10px] text-muted-foreground mt-0.5">{availableModels.length} trained models ready for deployment</p>
//           </div>
//           {availableModels.length === 0 ? (
//             <div className="p-8 text-center text-muted-foreground text-xs">
//               No trained models available. Train a model in the Experiments page.
//               <div className="mt-2">
//                 <a href="/orion/experiments" className="text-primary underline text-xs">Go to Experiments →</a>
//               </div>
//             </div>
//           ) : (
//             <div className="overflow-x-auto">
//               <table className="w-full text-xs">
//                 <thead>
//                   <tr className="border-b bg-muted/30">
//                     {["Model", "Algorithm", "AUC", "F1", "Accuracy", "Trained", "Approval", "Actions"].map(h => (
//                       <th key={h} className="text-left px-3 py-2 text-muted-foreground">{h}</th>
//                     ))}
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {availableModels.map(m => (
//                     <tr key={m.id} className="border-b hover:bg-muted/10" data-testid={`row-available-${m.id}`}>
//                       <td className="px-3 py-2 font-medium max-w-[160px] truncate">{m.name}</td>
//                       <td className="px-3 py-2 text-muted-foreground">{m.algorithm}</td>
//                       <td className="px-3 py-2 font-mono font-bold text-primary">{m.auc?.toFixed(4) ?? "—"}</td>
//                       <td className="px-3 py-2 font-mono">{m.f1Score?.toFixed(4) ?? "—"}</td>
//                       <td className="px-3 py-2 font-mono">{m.accuracy ? `${(m.accuracy * 100).toFixed(1)}%` : "—"}</td>
//                       <td className="px-3 py-2 text-muted-foreground">{m.trainedAt ? new Date(m.trainedAt).toLocaleDateString() : "—"}</td>
//                       <td className="px-3 py-2">
//                         <StatusBadge status={m.approvalStatus === "approved" ? "Approved" : m.approvalStatus === "rejected" ? "Rejected" : "Pending"} />
//                       </td>
//                       <td className="px-3 py-2">
//                         <div className="flex gap-1">
//                           <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-emerald-500/10 hover:text-emerald-500"
//                             onClick={() => deployMut.mutate(m.id)} title="Deploy"
//                             data-testid={`button-deploy-${m.id}`}>
//                             <PlayCircle className="w-3 h-3" />
//                           </Button>
//                           <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-amber-500/10 hover:text-amber-500"
//                             onClick={() => { setApprovalModel(m); setApprovalNotes(""); setApprovalAction("approve"); }}
//                             title="Submit for approval" data-testid={`button-request-approval-${m.id}`}>
//                             <Send className="w-3 h-3" />
//                           </Button>
//                           <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-red-500/10 hover:text-red-500"
//                             onClick={() => setDeleteId(m.id)} title="Delete"
//                             data-testid={`button-delete-available-${m.id}`}>
//                             <Trash2 className="w-3 h-3" />
//                           </Button>
//                         </div>
//                       </td>
//                     </tr>
//                   ))}
//                 </tbody>
//               </table>
//             </div>
//           )}
//         </div>

//         {/* ── ALL MODELS (monitoring table) ── */}
//         {models.filter(m => m.status !== "training").length > 0 && (
//           <div className="bg-card border rounded-lg overflow-hidden">
//             <div className="px-4 py-3 border-b">
//               <h3 className="text-sm font-semibold">All Models — Monitoring Overview</h3>
//             </div>
//             <div className="overflow-x-auto">
//               <table className="w-full text-xs">
//                 <thead>
//                   <tr className="border-b bg-muted/30">
//                     {["Model", "Algorithm", "Deployed", "AUC", "Predictions", "Monitor Status", "Approval", "Actions"].map(h => (
//                       <th key={h} className="text-left px-3 py-2 text-muted-foreground">{h}</th>
//                     ))}
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {models.filter(m => m.status !== "training").map(m => {
//                     const predCount = predCountForModel(m.id);
//                     const monStatus = getMonitoringStatus(m, predCount, totalActiveCustomers);
//                     return (
//                       <tr key={m.id} className="border-b hover:bg-muted/10" data-testid={`row-monitor-${m.id}`}>
//                         <td className="px-3 py-2 font-medium max-w-[140px] truncate">{m.name}</td>
//                         <td className="px-3 py-2 text-muted-foreground">{m.algorithm}</td>
//                         <td className="px-3 py-2">
//                           {m.isDeployed
//                             ? <span className="text-emerald-500 font-medium">Yes</span>
//                             : <span className="text-muted-foreground">No</span>}
//                         </td>
//                         <td className="px-3 py-2 font-mono">{m.auc?.toFixed(4) ?? "—"}</td>
//                         <td className="px-3 py-2 font-mono">{predCount.toLocaleString()}</td>
//                         <td className="px-3 py-2"><StatusBadge status={monStatus.label.split(" — ")[0]} /></td>
//                         <td className="px-3 py-2">
//                           <StatusBadge status={m.approvalStatus === "approved" ? "Approved" : m.approvalStatus === "rejected" ? "Rejected" : "Pending"} />
//                         </td>
//                         <td className="px-3 py-2">
//                           <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-red-500/10 hover:text-red-500"
//                             onClick={() => setDeleteId(m.id)} data-testid={`button-delete-monitor-${m.id}`}>
//                             <Trash2 className="w-3 h-3" />
//                           </Button>
//                         </td>
//                       </tr>
//                     );
//                   })}
//                 </tbody>
//               </table>
//             </div>
//           </div>
//         )}
//       </div>

//       {/* Delete Dialog */}
//       <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
//         <AlertDialogContent>
//           <AlertDialogHeader>
//             <AlertDialogTitle>Delete Model</AlertDialogTitle>
//             <AlertDialogDescription>
//               Delete <strong>{deleteTarget?.name}</strong>? All associated predictions will also be removed. This cannot be undone.
//             </AlertDialogDescription>
//           </AlertDialogHeader>
//           <AlertDialogFooter>
//             <AlertDialogCancel>Cancel</AlertDialogCancel>
//             <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
//               onClick={() => deleteId && deleteMut.mutate(deleteId)}>
//               Delete Model
//             </AlertDialogAction>
//           </AlertDialogFooter>
//         </AlertDialogContent>
//       </AlertDialog>

//       {/* Approval Dialog */}
//       <Dialog open={!!approvalModel} onOpenChange={() => setApprovalModel(null)}>
//         <DialogContent>
//           <DialogHeader>
//             <DialogTitle className="flex items-center gap-2">
//               <ShieldCheck className="w-4 h-4 text-primary" />Model Approval
//             </DialogTitle>
//           </DialogHeader>
//           <div className="space-y-4">
//             <div className="bg-muted/30 rounded p-3 space-y-1 text-xs">
//               <div className="flex justify-between"><span className="text-muted-foreground">Model</span><span className="font-medium">{approvalModel?.name}</span></div>
//               <div className="flex justify-between"><span className="text-muted-foreground">Algorithm</span><span>{approvalModel?.algorithm}</span></div>
//               <div className="flex justify-between"><span className="text-muted-foreground">AUC</span><span className="font-mono text-primary">{approvalModel?.auc?.toFixed(4)}</span></div>
//               <div className="flex justify-between"><span className="text-muted-foreground">Current Status</span><StatusBadge status={approvalModel?.approvalStatus === "approved" ? "Approved" : approvalModel?.approvalStatus === "rejected" ? "Rejected" : "Pending"} /></div>
//             </div>
//             <div className="flex gap-2">
//               <button onClick={() => setApprovalAction("approve")}
//                 className={`flex-1 py-2 rounded text-xs font-medium border transition-colors ${approvalAction === "approve" ? "bg-emerald-500 text-white border-emerald-500" : "border-border text-muted-foreground hover:bg-muted/20"}`}
//                 data-testid="button-approval-approve">
//                 ✓ Approve
//               </button>
//               <button onClick={() => setApprovalAction("reject")}
//                 className={`flex-1 py-2 rounded text-xs font-medium border transition-colors ${approvalAction === "reject" ? "bg-red-500 text-white border-red-500" : "border-border text-muted-foreground hover:bg-muted/20"}`}
//                 data-testid="button-approval-reject">
//                 ✗ Reject
//               </button>
//             </div>
//             <div>
//               <label className="text-[10px] text-muted-foreground uppercase">Notes (optional)</label>
//               <textarea
//                 className="mt-1 w-full text-xs bg-background border rounded px-2 py-1.5 resize-none"
//                 rows={3}
//                 placeholder="Add approval notes, conditions, or rejection reason..."
//                 value={approvalNotes}
//                 onChange={e => setApprovalNotes(e.target.value)}
//                 data-testid="input-approval-notes"
//               />
//             </div>
//           </div>
//           <DialogFooter>
//             <Button variant="outline" size="sm" onClick={() => setApprovalModel(null)}>Cancel</Button>
//             <Button size="sm"
//               className={approvalAction === "approve" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
//               onClick={() => approvalModel && approveMut.mutate({ id: approvalModel.id, notes: approvalNotes, action: approvalAction })}
//               disabled={approveMut.isPending}
//               data-testid="button-submit-approval">
//               {approvalAction === "approve" ? "Approve Model" : "Reject Model"}
//             </Button>
//           </DialogFooter>
//         </DialogContent>
//       </Dialog>
//     </OrionLayout>
//   );
// }
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { OrionLayout, KpiCard, StatusBadge, OrionNav } from "@/components/orion-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Trash2, PlayCircle, StopCircle, Target, CheckCircle, XCircle, AlertTriangle, Activity, TrendingUp, TrendingDown, ShieldCheck, Send, Sparkles, Brain, Info, Calendar, ArrowUpRight, ArrowDownRight, Minus, FlaskConical, Loader2 } from "lucide-react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from "recharts";
import type { MlModel } from "@shared/schema";

const CHART_COLORS = { auc: "#FFD822", accuracy: "#3b82f6", recall: "#a78bfa", psi: "#f97316", ks: "#ef4444", high: "#ef4444", med: "#f59e0b", low: "#22c55e" };

function DriftBar({ label, value, threshold }: { label: string; value: number; threshold: number }) {
  const pct = Math.min(value * 100, 100);
  const barColor = value < threshold * 0.5 ? "bg-emerald-500" : value < threshold ? "bg-amber-500" : "bg-red-500";
  const textColor = value >= threshold ? "text-red-600" : value >= threshold * 0.5 ? "text-amber-700" : "text-emerald-700";
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-mono font-bold ${textColor}`}>{value.toFixed(3)}</span>
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

function getMonitoringStatus(model: MlModel, predCount: number, total: number) {
  if (!model.isDeployed) return { status: "stale", label: "Not Deployed" };
  if (predCount === 0) return { status: "stale", label: "Stale — No Predictions" };
  const cov = total > 0 ? predCount / total : 0;
  if (cov < 0.3) return { status: "at risk", label: "At Risk — Low Coverage" };
  return { status: "healthy", label: "Healthy" };
}

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "high") return <span className="text-[9px] px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/10 text-red-700 font-medium">High</span>;
  if (severity === "medium") return <span className="text-[9px] px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-700 font-medium">Medium</span>;
  return <span className="text-[9px] px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground font-medium">Low</span>;
}

function RecommendationCard({ rec }: { rec: any }) {
  const borderColor = rec.severity === "high" ? "border-red-500/35 bg-red-500/8" : rec.severity === "medium" ? "border-amber-500/30 bg-amber-500/8" : "border-border bg-card";
  const Icon = rec.icon === "trend-down" ? TrendingDown : rec.icon === "sparkle" ? Sparkles : rec.icon === "shield" ? ShieldCheck : rec.icon === "calendar" ? Calendar : AlertTriangle;
  const iconColor = rec.severity === "high" ? "text-red-600" : rec.severity === "medium" ? "text-amber-600" : "text-muted-foreground";
  return (
    <div className={`border rounded-lg p-4 space-y-3 ${borderColor}`} data-testid={`rec-card-${rec.id}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs font-semibold">{rec.title}</span>
            <SeverityBadge severity={rec.severity} />
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">{rec.category}</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{rec.detail}</p>
        </div>
      </div>
      <div className="ml-7 space-y-2">
        <div className="border border-dashed border-primary/20 rounded px-3 py-2 bg-primary/5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-0.5">Recommended Action</p>
          <p className="text-xs text-foreground leading-relaxed">{rec.action}</p>
        </div>
        {rec.impact && (
          <div className="flex items-start gap-1.5 text-[10px] text-emerald-700">
            <TrendingUp className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>{rec.impact}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TrendIcon({ delta, threshold = 0 }: { delta: number; threshold?: number }) {
  if (delta > threshold) return <ArrowUpRight className="w-3 h-3 text-emerald-600" />;
  if (delta < -threshold) return <ArrowDownRight className="w-3 h-3 text-red-600" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

const CUSTOM_TOOLTIP_STYLE = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "10px" };

export default function OrionDeployPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [scoringModelId, setScoringModelId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [approvalModel, setApprovalModel] = useState<MlModel | null>(null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [approvalAction, setApprovalAction] = useState<"approve" | "reject">("approve");
  const [monitorModelId, setMonitorModelId] = useState<number | null>(null);
  const [monitorTab, setMonitorTab] = useState<"health" | "trends" | "drivers" | "insights">("health");
  const [prodDatasetId, setProdDatasetId] = useState<number | null>(null);

  const { data: modelsRaw = [] } = useQuery<MlModel[]>({ queryKey: ["/api/models"] });
  const { data: predictions = [] } = useQuery<any[]>({ queryKey: ["/api/predictions"] });
  const { data: custStats } = useQuery<{ total: number; active: number; churned: number }>({ queryKey: ["/api/customers/stats"] });
  const { data: allDatasets = [] } = useQuery<any[]>({ queryKey: ["/api/datasets"] });

  const models = modelsRaw as any[];
  const deployedModels = models.filter(m => m.isDeployed);
  const availableModels = models.filter(m => !m.isDeployed && m.status === "trained");
  const totalPredCount = (predictions as any[]).length;
  const totalActiveCustomers = custStats?.active ?? 500;

  const activeMonitorId = monitorModelId ?? deployedModels[0]?.id ?? null;

  const { data: monitoringData, isLoading: monitorLoading } = useQuery<any>({
    queryKey: ["/api/monitoring", activeMonitorId, prodDatasetId],
    enabled: !!activeMonitorId,
    queryFn: async () => {
      const url = prodDatasetId
        ? `/api/monitoring/${activeMonitorId}?prodDatasetId=${prodDatasetId}`
        : `/api/monitoring/${activeMonitorId}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

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
    mutationFn: (id: number) => apiRequest("POST", `/api/models/${id}/predict-customers`, prodDatasetId ? { prodDatasetId } : {}),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/predictions"] });
      qc.invalidateQueries({ queryKey: ["/api/monitoring", scoringModelId] });
      const title = prodDatasetId && data.prodAuc != null
        ? `Scored ${data.predicted} customers (prod) · AUC ${data.prodAuc.toFixed(4)} · Acc ${((data.prodAccuracy ?? 0) * 100).toFixed(1)}%`
        : `Scored ${data.predicted} customers`;
      toast({ title });
      setScoringModelId(null);
    },
    onError: (e: any) => { toast({ title: "Scoring failed", description: e.message, variant: "destructive" }); setScoringModelId(null); },
  });

  const evalProdMut = useMutation({
    mutationFn: ({ modelId, prodDatasetId }: { modelId: number; prodDatasetId: number }) =>
      apiRequest("POST", `/api/models/${modelId}/score-production`, { prodDatasetId }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/predictions"] });
      qc.invalidateQueries({ queryKey: ["/api/monitoring", activeMonitorId, prodDatasetId] });
      qc.invalidateQueries({ queryKey: ["/api/models"] });
      const m = data.metrics || {};
      const parts = [`${data.predicted} predictions`];
      if (m.auc != null) parts.push(`AUC ${m.auc.toFixed(4)}`);
      if (m.accuracy != null) parts.push(`Acc ${(m.accuracy * 100).toFixed(1)}%`);
      if (m.recall != null) parts.push(`Recall ${(m.recall * 100).toFixed(1)}%`);
      toast({ title: `Prod evaluation complete · ${parts.join(" · ")}` });
    },
    onError: (e: any) => toast({ title: "Evaluation failed", description: e.message, variant: "destructive" }),
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

  function getDriftMetrics(m: any) {
    // Use real values from monitoring API when available so KPI cards and drift bars stay in sync
    const realPsi = monitoringData?.summary?.latestPsi;
    const realKs = monitoringData?.summary?.latestKs;
    const psi = realPsi !== undefined ? parseFloat(realPsi.toFixed(3)) : parseFloat(((1 - (m.auc || 0.8)) * 0.4 + 0.02).toFixed(3));
    const ks = realKs !== undefined ? parseFloat(realKs.toFixed(3)) : parseFloat(((m.accuracy || 0.8) * 0.15).toFixed(3));
    const featureDrift = parseFloat((psi * 1.2).toFixed(3));
    const targetDrift = parseFloat((ks * 0.8).toFixed(3));
    const predDrift = parseFloat((psi * 0.9).toFixed(3));
    const segmentDrift = parseFloat(((1 - (m.recall || 0.8)) * 0.25).toFixed(3));
    return { psi, ks, featureDrift, targetDrift, predDrift, segmentDrift };
  }

  const avgAuc = deployedModels.length ? parseFloat((deployedModels.reduce((s, m) => s + (m.auc || 0), 0) / deployedModels.length).toFixed(4)) : 0;
  const healthyCount = deployedModels.filter(m => getMonitoringStatus(m, predCountForModel(m.id), totalActiveCustomers).status === "healthy").length;
  const atRiskCount = deployedModels.filter(m => getMonitoringStatus(m, predCountForModel(m.id), totalActiveCustomers).status === "at risk").length;
  const staleCount = deployedModels.filter(m => getMonitoringStatus(m, predCountForModel(m.id), totalActiveCustomers).status === "stale").length;
  const deleteTarget = models.find(m => m.id === deleteId);

  const activeMonitorModel = models.find(m => m.id === activeMonitorId);
  const summaryData = monitoringData?.summary;
  const highSeverityCount = (monitoringData?.recommendations || []).filter((r: any) => r.severity === "high").length;

  return (
    <OrionLayout title="Deploy & Scoring" subtitle="Production model management, drift monitoring, and AI-powered observability">
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
            <div className="p-8 text-center text-muted-foreground text-xs">No models deployed. Deploy a model from the available list below.</div>
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
                    const isActiveMonitor = m.id === activeMonitorId;
                    const displayAuc = (isActiveMonitor && summaryData?.prodAuc != null) ? summaryData.prodAuc : m.auc;
                    const displayAcc = (isActiveMonitor && summaryData?.prodAccuracy != null) ? summaryData.prodAccuracy : m.accuracy;
                    return (
                      <tr key={m.id} className="border-b hover:bg-muted/10" data-testid={`row-deployed-${m.id}`}>
                        <td className="px-3 py-2 font-medium max-w-[160px] truncate">{m.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{m.algorithm}</td>
                        <td className="px-3 py-2 font-mono font-bold text-primary">
                          {displayAuc?.toFixed(4) ?? "—"}
                          {isActiveMonitor && summaryData?.prodAuc != null && <span className="ml-1 text-[8px] text-blue-500">prod</span>}
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {displayAcc ? `${(displayAcc * 100).toFixed(1)}%` : "—"}
                          {isActiveMonitor && summaryData?.prodAccuracy != null && <span className="ml-1 text-[8px] text-blue-500">prod</span>}
                        </td>
                        <td className="px-3 py-2 font-mono">{predCount.toLocaleString()}</td>
                        <td className="px-3 py-2 text-muted-foreground">{m.deployedAt ? new Date(m.deployedAt).toLocaleDateString() : "—"}</td>
                        <td className="px-3 py-2"><StatusBadge status={monStatus.label.split(" — ")[0]} /></td>
                        <td className="px-3 py-2">
                          <StatusBadge status={m.approvalStatus === "approved" ? "Approved" : m.approvalStatus === "rejected" ? "Rejected" : "Pending"} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" className={`h-6 w-6 hover:bg-primary/10 hover:text-primary${prodDatasetId ? " ring-1 ring-blue-500/50" : ""}`}
                              onClick={() => { setScoringModelId(m.id); scoreMut.mutate(m.id); }}
                              disabled={scoreMut.isPending && scoringModelId === m.id}
                              title={prodDatasetId ? "Score customers on production data" : "Score customers"} data-testid={`button-score-${m.id}`}>
                              <Target className="w-3 h-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-amber-500/10 hover:text-amber-500"
                              onClick={() => { setApprovalModel(m); setApprovalNotes(""); setApprovalAction(m.approvalStatus === "approved" ? "reject" : "approve"); }}
                              title="Approve/reject" data-testid={`button-approve-${m.id}`}>
                              <ShieldCheck className="w-3 h-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-amber-500/10 hover:text-amber-500"
                              onClick={() => undeployMut.mutate(m.id)} title="Undeploy" data-testid={`button-undeploy-${m.id}`}>
                              <StopCircle className="w-3 h-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-red-500/10 hover:text-red-500"
                              onClick={() => setDeleteId(m.id)} title="Delete" data-testid={`button-delete-deployed-${m.id}`}>
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

        {/* ── MODEL OBSERVABILITY ── */}
        {deployedModels.length > 0 && (
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-semibold">Model Observability</h3>
                {highSeverityCount > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 font-bold border border-red-500/20">{highSeverityCount} alert{highSeverityCount > 1 ? "s" : ""}</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {deployedModels.length > 1 && (
                  <select
                    className="text-[10px] bg-muted border border-border rounded px-2 py-1 text-foreground"
                    value={activeMonitorId ?? ""}
                    onChange={e => { setMonitorModelId(Number(e.target.value)); setMonitorTab("health"); }}
                    data-testid="select-monitor-model"
                  >
                    {deployedModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}
                {/* Production dataset selector */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">Production data:</span>
                  <select
                    className="text-[10px] bg-muted border border-border rounded px-2 py-1 text-foreground"
                    value={prodDatasetId ?? ""}
                    onChange={e => setProdDatasetId(e.target.value ? Number(e.target.value) : null)}
                    data-testid="select-prod-dataset"
                  >
                    <option value="">— model predictions —</option>
                    {(allDatasets as any[]).map((ds: any) => (
                      <option key={ds.id} value={ds.id}>{ds.name} ({ds.rowCount?.toLocaleString()} rows)</option>
                    ))}
                  </select>
                  {/* Evaluate on Prod button — runs feature engineering + model on prod data */}
                  {prodDatasetId && activeMonitorId && (
                    <button
                      onClick={() => evalProdMut.mutate({ modelId: activeMonitorId, prodDatasetId })}
                      disabled={evalProdMut.isPending}
                      title="Run model on production data: applies full feature pipeline, scores prod accounts, computes AUC/Accuracy/Recall"
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                      data-testid="button-evaluate-prod"
                    >
                      {evalProdMut.isPending
                        ? <><Loader2 className="w-3 h-3 animate-spin" /> Evaluating…</>
                        : <><FlaskConical className="w-3 h-3" /> Evaluate on Prod</>}
                    </button>
                  )}
                </div>
                {summaryData?.prodDataset && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 border border-blue-500/20 font-medium">
                    Scoring: {summaryData.prodDataset.name} · {summaryData.prodDataset.rows?.toLocaleString()} rows
                    {summaryData.prodDataset.churnPct > 0 ? ` · ${summaryData.prodDataset.churnPct}% historical churn` : ""}
                  </span>
                )}
                <div className="flex gap-1">
                  {([
                    { id: "health", label: "Health" },
                    { id: "trends", label: "Trends" },
                    { id: "drivers", label: "Drivers" },
                    { id: "insights", label: "Insights" },
                  ] as const).map(t => (
                    <button key={t.id} onClick={() => setMonitorTab(t.id)} data-testid={`tab-monitor-${t.id}`}
                      className={`px-3 py-1 text-[10px] rounded font-medium transition-colors ${monitorTab === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {monitorLoading && (
              <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading monitoring data…</div>
            )}

            {/* ── HEALTH TAB ── */}
            {!monitorLoading && monitorTab === "health" && (
              <div className="p-4 space-y-4">
                {activeMonitorModel && summaryData && (
                  <>
                    {/* Summary KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="bg-muted/30 border rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">
                          AUC {summaryData.prodAuc != null ? <span className="text-blue-500">(prod)</span> : "(Training)"}
                        </p>
                        <p className="text-xl font-mono font-bold text-primary">
                          {(summaryData.prodAuc ?? summaryData.latestAuc)?.toFixed(4)}
                        </p>
                        {summaryData.prodAuc != null ? (
                          <p className="text-[9px] text-blue-500 mt-0.5">vs training: {summaryData.latestAuc?.toFixed(4)}</p>
                        ) : null}
                      </div>
                      <div className="bg-muted/30 border rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">
                          Recall {summaryData.prodRecall != null ? <span className="text-blue-500">(prod)</span> : "(Training)"}
                        </p>
                        <p className="text-xl font-mono font-bold">
                          {((summaryData.prodRecall ?? summaryData.latestRecall) * 100).toFixed(1)}%
                        </p>
                        {summaryData.prodRecall != null ? (
                          <p className="text-[9px] text-blue-500 mt-0.5">vs training: {(summaryData.latestRecall * 100).toFixed(1)}%</p>
                        ) : null}
                      </div>
                      <div className="bg-muted/30 border rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">PSI</p>
                        <p className={`text-xl font-mono font-bold ${summaryData.latestPsi > 0.2 ? "text-red-600" : summaryData.latestPsi > 0.1 ? "text-amber-700" : "text-emerald-700"}`}>{summaryData.latestPsi?.toFixed(3)}</p>
                        <p className="text-[9px] text-muted-foreground mt-0.5">threshold: 0.200</p>
                      </div>
                      <div className="bg-muted/30 border rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">KS Stat</p>
                        <p className={`text-xl font-mono font-bold ${summaryData.latestKs > 0.1 ? "text-amber-700" : "text-emerald-700"}`}>{summaryData.latestKs?.toFixed(3)}</p>
                        <p className="text-[9px] text-muted-foreground mt-0.5">threshold: 0.100</p>
                      </div>
                      <div className="bg-muted/30 border rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">High Risk %</p>
                        <p className="text-xl font-mono font-bold text-amber-700">{summaryData.latestHighRiskPct?.toFixed(1)}%</p>
                      </div>
                    </div>

                    {/* Per-model drift bars */}
                    {deployedModels.filter(m => m.id === activeMonitorId).map(m => {
                      const drift = getDriftMetrics(m);
                      const predCount = predCountForModel(m.id);
                      const coverage = totalActiveCustomers > 0 ? ((predCount / totalActiveCustomers) * 100).toFixed(1) : "0.0";
                      const driftAlert = drift.psi > 0.2 || drift.featureDrift > 0.25;
                      return (
                        <div key={m.id} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="border rounded-lg p-4 space-y-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Distribution Drift</p>
                            <DriftBar label="PSI (Population Stability)" value={drift.psi} threshold={0.2} />
                            <DriftBar label="KS Statistic" value={drift.ks} threshold={0.1} />
                            <DriftBar label="Feature Drift Score" value={drift.featureDrift} threshold={0.25} />
                          </div>
                          <div className="border rounded-lg p-4 space-y-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Coverage & Prediction Health</p>
                            <DriftBar label="Target Drift" value={drift.targetDrift} threshold={0.15} />
                            <DriftBar label="Prediction Distribution Drift" value={drift.predDrift} threshold={0.2} />
                            <DriftBar label="Segment Drift" value={drift.segmentDrift} threshold={0.1} />
                            <div className="flex items-center justify-between text-[10px] pt-1 border-t">
                              <span className="text-muted-foreground">Prediction coverage</span>
                              <span className="font-mono font-bold">{predCount.toLocaleString()} / {totalActiveCustomers} ({coverage}%)</span>
                            </div>
                          </div>
                          {driftAlert && (
                            <div className="md:col-span-2 flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2">
                              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                              Drift alert — PSI {drift.psi.toFixed(3)} exceeds threshold 0.200. Consider retraining. See Insights tab for recommendations.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}

            {/* ── TRENDS TAB ── */}
            {!monitorLoading && monitorTab === "trends" && monitoringData && (
              <div className="p-4 space-y-6">
                {/* Performance Trend */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-primary" />Performance Metrics — Monthly Trend</h4>
                    <span className="text-[10px] text-muted-foreground">Model: {activeMonitorModel?.name}</span>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={monitoringData.weeklyMetrics} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis domain={[0, 1.0]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => v.toFixed(2)} />
                      <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} formatter={(v: any) => (v as number).toFixed(4)} />
                      <Legend wrapperStyle={{ fontSize: "10px" }} />
                      <Line type="monotone" dataKey="auc" stroke={CHART_COLORS.auc} strokeWidth={2} dot={false} name="AUC" />
                      <Line type="monotone" dataKey="accuracy" stroke={CHART_COLORS.accuracy} strokeWidth={2} dot={false} name="Accuracy" />
                      <Line type="monotone" dataKey="recall" stroke={CHART_COLORS.recall} strokeWidth={2} dot={false} name="Recall" strokeDasharray="4 2" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Drift Trend */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-amber-400" />Drift Metrics — PSI & KS Over Time</h4>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={monitoringData.weeklyMetrics} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="psiGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS.psi} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={CHART_COLORS.psi} stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="ksGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS.ks} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={CHART_COLORS.ks} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => v.toFixed(2)} />
                      <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} formatter={(v: any) => (v as number).toFixed(4)} />
                      <Legend wrapperStyle={{ fontSize: "10px" }} />
                      <Area type="monotone" dataKey="psi" stroke={CHART_COLORS.psi} fill="url(#psiGrad)" strokeWidth={2} name="PSI" />
                      <Area type="monotone" dataKey="ks" stroke={CHART_COLORS.ks} fill="url(#ksGrad)" strokeWidth={2} name="KS Stat" />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 text-[10px] text-muted-foreground">
                    <span>PSI threshold: <strong className="text-amber-400">0.200</strong></span>
                    <span>KS threshold: <strong className="text-amber-400">0.100</strong></span>
                    <span>Values above threshold indicate distribution drift requiring attention.</span>
                  </div>
                </div>

                {/* Risk Distribution Over Time */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-blue-400" />Prediction Volume & Risk Mix</h4>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={monitoringData.weeklyMetrics} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: "10px" }} />
                      <Bar dataKey="highRiskPct" stackId="a" fill={CHART_COLORS.high} name="High Risk %" opacity={0.8} />
                      <Bar dataKey="medRiskPct" stackId="a" fill={CHART_COLORS.med} name="Medium Risk %" opacity={0.8} />
                      <Bar dataKey="lowRiskPct" stackId="a" fill={CHART_COLORS.low} name="Low Risk %" opacity={0.8} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* ── DRIVERS TAB ── */}
            {!monitorLoading && monitorTab === "drivers" && monitoringData && (
              <div className="p-4 space-y-5">
                {/* Driver change summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(monitoringData.driverChanges || []).slice(0, 6).map((d: any) => (
                    <div key={d.name} className={`border rounded-lg p-3 ${d.trend === "rising" ? "border-emerald-500/30 bg-emerald-500/8" : d.trend === "declining" ? "border-amber-500/30 bg-amber-500/8" : ""}`}
                      data-testid={`driver-card-${d.name}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-[11px] font-mono font-semibold text-blue-700 truncate">{d.name}</p>
                          <p className="text-[9px] text-muted-foreground capitalize">{d.displayName}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {d.trend === "rising" && <><ArrowUpRight className="w-3.5 h-3.5 text-emerald-700" /><span className="text-[9px] text-emerald-700 font-bold">Rising</span></>}
                          {d.trend === "declining" && <><ArrowDownRight className="w-3.5 h-3.5 text-amber-700" /><span className="text-[9px] text-amber-700 font-bold">Declining</span></>}
                          {d.trend === "stable" && <><Minus className="w-3 h-3 text-muted-foreground" /><span className="text-[9px] text-muted-foreground">Stable</span></>}
                        </div>
                      </div>
                      <div className="flex-1 h-2 bg-muted rounded overflow-hidden mb-1">
                        <div className="h-full rounded bg-primary" style={{ width: `${(d.current / 0.278) * 100}%` }} />
                      </div>
                      <div className="flex justify-between text-[9px]">
                        <span className="text-muted-foreground">Score: <span className="font-mono text-foreground">{d.current.toFixed(3)}</span></span>
                        <span className={d.delta > 0 ? "text-emerald-400" : d.delta < -0.005 ? "text-amber-400" : "text-muted-foreground"}>
                          {d.delta > 0 ? "+" : ""}{(d.delta * 100).toFixed(1)} ({d.deltaPct > 0 ? "+" : ""}{d.deltaPct}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Feature importance over time chart */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold flex items-center gap-1.5"><Brain className="w-3.5 h-3.5 text-primary" />Driver Evolution — Importance Scores Over 6 Periods</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={monitoringData.featureHistory} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => v.toFixed(2)} />
                      <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} formatter={(v: any) => (v as number).toFixed(4)} />
                      <Legend wrapperStyle={{ fontSize: "10px" }} />
                      {(monitoringData.featureNames || []).map((name: string, idx: number) => {
                        const colors = ["#FFD822", "#3b82f6", "#a78bfa", "#f97316", "#22c55e", "#ec4899"];
                        return <Line key={name} type="monotone" dataKey={name} stroke={colors[idx % colors.length]} strokeWidth={1.5} dot={false} name={name.replace(/_/g, " ")} />;
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Rising / Declining summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-emerald-500/30 rounded-lg p-3 bg-emerald-500/8">
                    <h5 className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-1"><ArrowUpRight className="w-3 h-3" />Rising Drivers</h5>
                    {(monitoringData.driverChanges || []).filter((d: any) => d.trend === "rising").length === 0
                      ? <p className="text-[10px] text-muted-foreground">No significantly rising drivers detected.</p>
                      : (monitoringData.driverChanges || []).filter((d: any) => d.trend === "rising").map((d: any) => (
                        <div key={d.name} className="flex justify-between text-[10px] py-0.5">
                          <span className="font-mono text-emerald-800">{d.name}</span>
                          <span className="text-emerald-700 font-medium">+{d.deltaPct}%</span>
                        </div>
                      ))}
                  </div>
                  <div className="border border-amber-500/30 rounded-lg p-3 bg-amber-500/8">
                    <h5 className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1"><ArrowDownRight className="w-3 h-3" />Declining Drivers</h5>
                    {(monitoringData.driverChanges || []).filter((d: any) => d.trend === "declining").length === 0
                      ? <p className="text-[10px] text-muted-foreground">No significantly declining drivers detected.</p>
                      : (monitoringData.driverChanges || []).filter((d: any) => d.trend === "declining").map((d: any) => (
                        <div key={d.name} className="flex justify-between text-[10px] py-0.5">
                          <span className="font-mono text-amber-800">{d.name}</span>
                          <span className="text-amber-700 font-medium">{d.deltaPct}%</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── INSIGHTS TAB ── */}
            {!monitorLoading && monitorTab === "insights" && monitoringData && (
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-lg border border-blue-500/30 bg-blue-500/8">
                  <Sparkles className="w-4 h-4 text-blue-700 flex-shrink-0" />
                  <p className="text-[11px] text-blue-800">
                    ML Orion analysed 12 weeks of performance trends, drift signals, and driver evolution to generate these prioritised recommendations.
                  </p>
                </div>
                {/* High severity first */}
                {(monitoringData.recommendations || [])
                  .sort((a: any, b: any) => { const o: Record<string, number> = { high: 0, medium: 1, low: 2 }; return (o[a.severity] ?? 3) - (o[b.severity] ?? 3); })
                  .map((rec: any) => <RecommendationCard key={rec.id} rec={rec} />)
                }
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
              <div className="mt-2"><a href="/orion/experiments" className="text-primary underline text-xs">Go to Experiments →</a></div>
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
                            onClick={() => deployMut.mutate(m.id)} title="Deploy" data-testid={`button-deploy-${m.id}`}>
                            <PlayCircle className="w-3 h-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-amber-500/10 hover:text-amber-500"
                            onClick={() => { setApprovalModel(m); setApprovalNotes(""); setApprovalAction("approve"); }}
                            title="Submit for approval" data-testid={`button-request-approval-${m.id}`}>
                            <Send className="w-3 h-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-red-500/10 hover:text-red-500"
                            onClick={() => setDeleteId(m.id)} title="Delete" data-testid={`button-delete-available-${m.id}`}>
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

        {/* ── ALL MODELS ── */}
        {models.filter(m => m.status !== "training").length > 0 && (
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b">
              <h3 className="text-sm font-semibold">All Models — Registry</h3>
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
                        <td className="px-3 py-2">{m.isDeployed ? <span className="text-emerald-500 font-medium">Yes</span> : <span className="text-muted-foreground">No</span>}</td>
                        <td className="px-3 py-2 font-mono">{m.auc?.toFixed(4) ?? "—"}</td>
                        <td className="px-3 py-2 font-mono">{predCount.toLocaleString()}</td>
                        <td className="px-3 py-2"><StatusBadge status={monStatus.label.split(" — ")[0]} /></td>
                        <td className="px-3 py-2"><StatusBadge status={m.approvalStatus === "approved" ? "Approved" : m.approvalStatus === "rejected" ? "Rejected" : "Pending"} /></td>
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
            <DialogTitle>{approvalAction === "approve" ? "Approve" : "Reject"} Model</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Model: <strong>{approvalModel?.name}</strong></p>
            <div>
              <label className="text-xs font-medium">Review Notes</label>
              <textarea
                className="mt-1 w-full h-20 text-xs border rounded p-2 bg-background resize-none"
                placeholder="Add notes for the governance audit log…"
                value={approvalNotes}
                onChange={e => setApprovalNotes(e.target.value)}
                data-testid="textarea-approval-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalModel(null)}>Cancel</Button>
            <Button
              className={approvalAction === "approve" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
              onClick={() => approvalModel && approveMut.mutate({ id: approvalModel.id, notes: approvalNotes, action: approvalAction })}
              disabled={approveMut.isPending}
              data-testid="button-confirm-approval"
            >
              {approvalAction === "approve" ? <><CheckCircle className="w-3.5 h-3.5 mr-1.5" />Approve Model</> : <><XCircle className="w-3.5 h-3.5 mr-1.5" />Reject Model</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OrionLayout>
  );
}
