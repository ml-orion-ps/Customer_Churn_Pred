import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { OrionLayout, KpiCard, StatusBadge, OrionNav } from "@/components/orion-layout";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Rocket, PauseCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const RISK_COLORS = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" };
const BAR_COLORS = ["#3b82f6", "#8b5cf6", "#10b981"];

export default function OrionOverview() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/orion/overview"] });
  const { data: models } = useQuery<any[]>({ queryKey: ["/api/models"] });

  const deployMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/models/${id}/deploy`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/models"] }); qc.invalidateQueries({ queryKey: ["/api/orion/overview"] }); toast({ title: "Model deployed" }); },
  });
  const undeployMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/models/${id}/undeploy`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/models"] }); qc.invalidateQueries({ queryKey: ["/api/orion/overview"] }); toast({ title: "Model undeployed" }); },
  });

  const kpis = data?.kpis || {};
  const riskDist = data?.riskDistribution || { low: 0, medium: 0, high: 0 };
  const pieData = [
    { name: "Low Risk", value: riskDist.low, color: RISK_COLORS.low },
    { name: "Medium Risk", value: riskDist.medium, color: RISK_COLORS.medium },
    { name: "High Risk", value: riskDist.high, color: RISK_COLORS.high },
  ];

  const perfData = (data?.modelPerformance || []).slice(0, 6);

  return (
    <OrionLayout title="ML Orion Overview" subtitle="Decision model factory — all numbers from live database" isLoading={isLoading}>
      <div className="mb-4"><OrionNav current="/orion/overview" /></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Total Models" value={kpis.totalModels ?? "—"} />
        <KpiCard label="Deployed" value={kpis.deployedModels ?? "—"} trend={kpis.deployedModels > 0 ? "up" : undefined} />
        <KpiCard label="Avg AUC (Deployed)" value={kpis.avgAuc ? `${(kpis.avgAuc * 100).toFixed(1)}%` : "—"} />
        <KpiCard label="Total Predictions" value={kpis.totalPredictions?.toLocaleString() ?? "—"} />
        <KpiCard label="Customers Scored" value={kpis.customersScored?.toLocaleString() ?? "—"} />
        <KpiCard label="Datasets" value={kpis.totalDatasets ?? "—"} />
        <KpiCard label="Retention Success" value={kpis.retentionSuccessRate ? `${kpis.retentionSuccessRate}%` : "—"} trend="up" />
        <KpiCard label="Revenue at Risk" value={kpis.revenueAtRisk ? `$${(kpis.revenueAtRisk / 1000).toFixed(0)}K` : "—"} trend="down" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="border rounded-lg p-4 bg-card">
          <h3 className="text-sm font-semibold mb-4">Model Performance Comparison</h3>
          {perfData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No models trained yet. Go to Experiment Lab to train your first model.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={perfData} margin={{ left: -10 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                <Tooltip formatter={(v: any) => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="accuracy" name="Accuracy" fill={BAR_COLORS[0]} radius={[2, 2, 0, 0]} />
                <Bar dataKey="auc" name="AUC-ROC" fill={BAR_COLORS[1]} radius={[2, 2, 0, 0]} />
                <Bar dataKey="f1" name="F1 Score" fill={BAR_COLORS[2]} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="border rounded-lg p-4 bg-card">
          <h3 className="text-sm font-semibold mb-1">Active Customer Risk Distribution</h3>
          <p className="text-xs text-muted-foreground mb-3">Same data powering Command Center — single source of truth</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 justify-center text-xs">
            <span>Churn Rate: <strong className="text-red-500">{data?.churnRate}%</strong></span>
            <span>Revenue at Risk: <strong className="text-amber-500">${((data?.revenueAtRisk || 0) / 1000).toFixed(0)}K</strong></span>
          </div>
        </div>
      </div>

      <div className="border rounded-lg bg-card">
        <div className="p-4 border-b">
          <h3 className="text-sm font-semibold">Model Registry</h3>
          <p className="text-xs text-muted-foreground mt-1">Manage all trained models — deploy to activate churn scoring</p>
        </div>
        {(!models || models.length === 0) ? (
          <p className="text-sm text-muted-foreground text-center py-10">No models yet. Train your first model in the Experiment Lab.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {["Name", "Algorithm", "Status", "Accuracy", "AUC", "F1", "Precision", "Recall", "Actions"].map(h => (
                    <th key={h} className="text-left p-3 font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {models.map((m: any) => (
                  <tr key={m.id} className="border-t hover:bg-muted/30 transition-colors" data-testid={`row-model-${m.id}`}>
                    <td className="p-3 font-medium max-w-[180px] truncate" title={m.name}>{m.name}</td>
                    <td className="p-3 text-muted-foreground">{m.algorithm}</td>
                    <td className="p-3"><StatusBadge status={m.isDeployed ? "Production" : m.status} /></td>
                    <td className="p-3">{m.accuracy ? `${(m.accuracy * 100).toFixed(1)}%` : "—"}</td>
                    <td className="p-3 font-semibold text-blue-600">{m.auc ? `${(m.auc * 100).toFixed(1)}%` : "—"}</td>
                    <td className="p-3">{m.f1Score ? `${(m.f1Score * 100).toFixed(1)}%` : "—"}</td>
                    <td className="p-3">{m.precision ? `${(m.precision * 100).toFixed(1)}%` : "—"}</td>
                    <td className="p-3">{m.recall ? `${(m.recall * 100).toFixed(1)}%` : "—"}</td>
                    <td className="p-3">
                      {m.isDeployed ? (
                        <Button size="sm" variant="outline" className="h-6 text-xs gap-1" data-testid={`button-undeploy-${m.id}`}
                          onClick={() => undeployMut.mutate(m.id)} disabled={undeployMut.isPending}>
                          <PauseCircle className="w-3 h-3" /> Undeploy
                        </Button>
                      ) : (
                        <Button size="sm" className="h-6 text-xs gap-1" data-testid={`button-deploy-${m.id}`}
                          onClick={() => deployMut.mutate(m.id)} disabled={deployMut.isPending}>
                          <Rocket className="w-3 h-3" /> Deploy
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </OrionLayout>
  );
}
