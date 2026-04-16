import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { OrionLayout, KpiCard, StatusBadge, OrionNav } from "@/components/orion-layout";
import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck, Database, Clock, User, Users, Activity } from "lucide-react";

function CompliancePip({ ok }: { ok: boolean }) {
  return ok
    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
    : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
}

const ACTION_ICON: Record<string, string> = {
  train: "🧪",
  deploy: "🚀",
  undeploy: "⏹",
  score: "🎯",
  delete: "🗑",
  approved: "✅",
  rejected: "❌",
  approve: "✅",
};

const ACTION_COLOR: Record<string, string> = {
  train: "text-blue-400",
  deploy: "text-emerald-400",
  undeploy: "text-amber-400",
  score: "text-primary",
  delete: "text-red-400",
  approved: "text-emerald-400",
  rejected: "text-red-400",
  approve: "text-emerald-400",
};

export default function OrionGovernancePage() {
  const [tab, setTab] = useState<"registry" | "audit" | "compliance">("registry");
  const [auditFilter, setAuditFilter] = useState<string>("all");

  const { data: gov, isLoading } = useQuery<any>({ queryKey: ["/api/orion/governance"] });

  const registry: any[] = gov?.registry ?? [];
  const auditEntries: any[] = gov?.auditLog ?? [];
  const summary = gov?.summary ?? {};

  const filteredAudit = auditFilter === "all"
    ? auditEntries
    : auditEntries.filter(e => e.action === auditFilter || e.entityType === auditFilter);

  const actionTypes = Array.from(new Set(auditEntries.map(e => e.action)));

  const compliantCount = registry.filter(r => Object.values(r.complianceChecks || {}).every(Boolean)).length;

  return (
    <OrionLayout title="Governance" subtitle="Model registry, compliance, and full audit trail" isLoading={isLoading}>
      <div className="space-y-4">
        <OrionNav current="/orion/governance" />

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <KpiCard label="Total Models" value={summary.totalModels ?? 0} />
          <KpiCard label="Deployed" value={summary.deployed ?? 0} color="green" />
          <KpiCard label="Approved" value={summary.approved ?? 0} color="green" />
          <KpiCard label="Pending Approval" value={summary.pendingApproval ?? 0} color={summary.pendingApproval > 0 ? "amber" : "green"} />
          <KpiCard label="Compliant" value={compliantCount} color={compliantCount === registry.length && registry.length > 0 ? "green" : "amber"} sub={`of ${registry.length} models`} />
          <KpiCard label="Audit Events" value={auditEntries.length} color="blue" />
        </div>

        {/* Tab Nav */}
        <div className="flex gap-1 border-b">
          {(["registry", "audit", "compliance"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} data-testid={`tab-gov-${t}`}
              className={`px-4 py-2 text-xs font-medium capitalize border-b-2 transition-colors ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t === "audit" ? "Audit Log" : t === "compliance" ? "Compliance Checks" : "Model Registry"}
            </button>
          ))}
        </div>

        {/* ── MODEL REGISTRY ── */}
        {tab === "registry" && (
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" />Model Registry
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Complete lineage: training date, deployment date, approval status, and data source</p>
            </div>
            {registry.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-xs">
                No models registered. Train models in the Experiments page.
                <div className="mt-2"><a href="/orion/experiments" className="text-primary underline">Go to Experiments →</a></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      {["Model", "Algorithm", "Dataset", "AUC", "F1", "Status", "Trained", "Deployed", "Approval", "Approver", "Predictions"].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {registry.map(m => (
                      <tr key={m.id} className="border-b hover:bg-muted/10" data-testid={`row-registry-${m.id}`}>
                        <td className="px-3 py-2">
                          <p className="font-medium max-w-[150px] truncate">{m.name}</p>
                          <p className="text-[9px] text-muted-foreground">ID: {m.id}</p>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{m.algorithm}</td>
                        <td className="px-3 py-2">
                          <p className="max-w-[120px] truncate">{m.datasetName}</p>
                          <p className="text-[9px] text-muted-foreground">{m.datasetRows.toLocaleString()} rows</p>
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-primary">{m.auc?.toFixed(4) ?? "—"}</td>
                        <td className="px-3 py-2 font-mono">{m.f1Score?.toFixed(4) ?? "—"}</td>
                        <td className="px-3 py-2"><StatusBadge status={m.isDeployed ? "deployed" : m.status} /></td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5 shrink-0" />
                            {m.trainedAt ? new Date(m.trainedAt).toLocaleDateString() : "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {m.deployedAt
                            ? <span className="text-emerald-400">{new Date(m.deployedAt).toLocaleDateString()}</span>
                            : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={
                            m.approvalStatus === "approved" ? "Approved"
                              : m.approvalStatus === "rejected" ? "Rejected"
                                : "Pending"
                          } />
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {m.approvedBy ? (
                            <div>
                              <p className="text-[10px]">{m.approvedBy}</p>
                              <p className="text-[9px] text-muted-foreground/60">{m.approvedAt ? new Date(m.approvedAt).toLocaleDateString() : ""}</p>
                            </div>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono">{m.predictionCount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── AUDIT LOG ── */}
        {tab === "audit" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-muted-foreground">Filter by action:</span>
              {["all", ...actionTypes].map(f => (
                <button key={f} onClick={() => setAuditFilter(f)} data-testid={`filter-audit-${f}`}
                  className={`px-2.5 py-1 text-[10px] rounded font-medium transition-colors ${auditFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                  {f === "all" ? "All" : f}
                </button>
              ))}
            </div>

            <div className="bg-card border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-500" />Audit Log
                </h3>
                <span className="text-[10px] text-muted-foreground">{filteredAudit.length} events</span>
              </div>
              {filteredAudit.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-xs">
                  No audit events recorded yet. Events are logged automatically when you train, deploy, score, or delete models.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        {["Timestamp", "Action", "Entity Type", "Entity", "Detail", "User", "Team", "Status"].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAudit.map((e: any) => (
                        <tr key={e.id} className="border-b hover:bg-muted/10" data-testid={`row-audit-${e.id}`}>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap font-mono text-[10px]">
                            {e.createdAt ? new Date(e.createdAt).toLocaleString() : "—"}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`font-medium flex items-center gap-1 ${ACTION_COLOR[e.action] ?? "text-foreground"}`}>
                              <span>{ACTION_ICON[e.action] ?? "•"}</span>
                              {e.action}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground capitalize">{e.entityType}</td>
                          <td className="px-3 py-2 font-medium max-w-[140px] truncate">{e.entityName ?? "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground max-w-[240px] truncate" title={e.detail}>{e.detail ?? "—"}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1 text-[10px]">
                              <User className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                              {e.user ?? "system"}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Users className="w-2.5 h-2.5 shrink-0" />
                              {e.team ?? "ML Ops"}
                            </div>
                          </td>
                          <td className="px-3 py-2"><StatusBadge status={e.status === "success" ? "Pass" : "Fail"} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── COMPLIANCE ── */}
        {tab === "compliance" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Fully Compliant" value={compliantCount} color={compliantCount === registry.length && registry.length > 0 ? "green" : "amber"} sub={`of ${registry.length} models`} />
              <KpiCard label="Data Lineage Pass" value={registry.filter(r => r.complianceChecks?.dataLineage).length} color="green" />
              <KpiCard label="Metrics Recorded" value={registry.filter(r => r.complianceChecks?.metricsRecorded).length} color="green" />
              <KpiCard label="Features Documented" value={registry.filter(r => r.complianceChecks?.featureDocumented).length} color="green" />
            </div>

            <div className="bg-card border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />Compliance Matrix
                </h3>
              </div>
              {registry.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-xs">No models to evaluate.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-3 py-2 text-muted-foreground font-medium">Model</th>
                        <th className="text-center px-3 py-2 text-muted-foreground font-medium">Data Lineage</th>
                        <th className="text-center px-3 py-2 text-muted-foreground font-medium">Metrics</th>
                        <th className="text-center px-3 py-2 text-muted-foreground font-medium">Features</th>
                        <th className="text-center px-3 py-2 text-muted-foreground font-medium">Hyperparams</th>
                        <th className="text-center px-3 py-2 text-muted-foreground font-medium">Approval</th>
                        <th className="text-center px-3 py-2 text-muted-foreground font-medium">Overall</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registry.map(m => {
                        const cc = m.complianceChecks ?? {};
                        const hasApproval = m.approvalStatus === "approved";
                        const allPass = cc.dataLineage && cc.metricsRecorded && cc.featureDocumented && cc.hyperparamsLogged && hasApproval;
                        return (
                          <tr key={m.id} className="border-b hover:bg-muted/10" data-testid={`row-compliance-${m.id}`}>
                            <td className="px-3 py-2">
                              <p className="font-medium max-w-[160px] truncate">{m.name}</p>
                              <p className="text-[9px] text-muted-foreground">{m.algorithm}</p>
                            </td>
                            <td className="px-3 py-2 text-center"><CompliancePip ok={!!cc.dataLineage} /></td>
                            <td className="px-3 py-2 text-center"><CompliancePip ok={!!cc.metricsRecorded} /></td>
                            <td className="px-3 py-2 text-center"><CompliancePip ok={!!cc.featureDocumented} /></td>
                            <td className="px-3 py-2 text-center"><CompliancePip ok={!!cc.hyperparamsLogged} /></td>
                            <td className="px-3 py-2 text-center"><CompliancePip ok={hasApproval} /></td>
                            <td className="px-3 py-2 text-center">
                              {allPass
                                ? <span className="text-[10px] text-emerald-500 font-medium">✓ Pass</span>
                                : <span className="text-[10px] text-amber-400 font-medium">⚠ Partial</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-card border rounded-lg p-4">
              <h4 className="text-xs font-semibold mb-3 text-muted-foreground uppercase">Compliance Legend</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {[
                  { label: "Data Lineage", desc: "Dataset linked and traceable" },
                  { label: "Metrics Recorded", desc: "AUC and accuracy available" },
                  { label: "Features Documented", desc: "Feature importance recorded" },
                  { label: "Hyperparams Logged", desc: "Training config saved" },
                  { label: "Approval", desc: "Approved by governance team" },
                ].map(item => (
                  <div key={item.label} className="border rounded p-2 space-y-0.5">
                    <p className="font-medium">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </OrionLayout>
  );
}
