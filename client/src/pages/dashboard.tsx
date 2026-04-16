import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPICard } from "@/components/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Users, DollarSign, AlertTriangle, TrendingDown, Activity,
  Shield, Zap, Wifi, CheckCircle, BarChart3, Target
} from "lucide-react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from "recharts";

const RISK_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

const SEVERITY_STYLES: Record<string, string> = {
  high: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  low: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
};

export default function Dashboard() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/analytics/command-center"] });

  if (isLoading) return <CommandCenterSkeleton />;
  if (!data) return null;

  const { kpis, riskDistribution, monthlyChurnTrend, topDrivers, topSegments, riskAlerts } = data;

  const riskPieData = [
    { name: "High", value: riskDistribution.high },
    { name: "Medium", value: riskDistribution.medium },
    { name: "Low", value: riskDistribution.low },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="command-center-page">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Command Center</h1>
        <p className="text-sm text-muted-foreground mt-1" data-testid="text-page-subtitle">
          Real-time customer churn intelligence and operational overview
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="kpi-row-primary">
        <KPICard
          title="Copper Customers"
          value={kpis.activeCustomers?.toLocaleString()}
          subtitle={`${kpis.totalCustomers?.toLocaleString()} total`}
          icon={Users}
          variant="default"
        />
        <KPICard
          title="Churn Rate"
          value={`${kpis.churnRate}%`}
          subtitle={`${(kpis.totalCustomers - kpis.activeCustomers)?.toLocaleString()} churned`}
          icon={TrendingDown}
          variant="danger"
          trend={{ value: kpis.churnRate > 20 ? 2.3 : -1.2, label: "vs last quarter" }}
        />
        <KPICard
          title="Revenue at Risk"
          value={`$${(kpis.revenueAtRisk / 1000).toFixed(0)}K`}
          subtitle="Annual projected loss"
          icon={DollarSign}
          variant="warning"
        />
        <KPICard
          title="Customers at Risk"
          value={kpis.customersAtRisk?.toLocaleString()}
          subtitle="Score > 60% probability"
          icon={AlertTriangle}
          variant="danger"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="kpi-row-secondary">
        <KPICard
          title="Retention Success Rate"
          value={`${kpis.retentionSuccessRate}%`}
          subtitle="Completed saves"
          icon={CheckCircle}
          variant="success"
        />
        <KPICard
          title="Save Actions Running"
          value={kpis.saveActionsRunning}
          subtitle="Active interventions"
          icon={Zap}
          variant="default"
        />
        <KPICard
          title="Fiber Competition Exposure"
          value={`${kpis.fiberCompetitionExposure}%`}
          subtitle="Active customers in fiber zones"
          icon={Wifi}
          variant="warning"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-4" data-testid="charts-row">
        <Card className="lg:col-span-7">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              Customer Churn Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={monthlyChurnTrend || []}>
                <defs>
                  <linearGradient id="churnTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(25, 85%, 55%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(25, 85%, 55%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, background: "hsl(220, 20%, 97%)", border: "1px solid hsl(220, 15%, 90%)" }}
                  formatter={(value: number) => [value, "Churned"]}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(25, 85%, 55%)"
                  fill="url(#churnTrendGrad)"
                  strokeWidth={2}
                  name="Churned Customers"
                  data-testid="chart-churn-trend"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              Risk Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={riskPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={75}
                    innerRadius={45}
                    strokeWidth={2}
                    data-testid="chart-risk-distribution"
                  >
                    {riskPieData.map((entry) => (
                      <Cell key={entry.name} fill={RISK_COLORS[entry.name.toLowerCase()]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 w-full">
                {riskPieData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-2" data-testid={`risk-item-${item.name.toLowerCase()}`}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: RISK_COLORS[item.name.toLowerCase()] }} />
                      <span className="text-sm">{item.name} Risk</span>
                    </div>
                    <Badge variant="secondary">{item.value}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-testid="bottom-tiles">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              Top Churn Drivers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(topDrivers || []).map((driver: any, i: number) => (
                <div key={driver.driver} className="space-y-1" data-testid={`driver-item-${i}`}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{driver.driver}</span>
                    <span className="text-muted-foreground font-medium shrink-0">{driver.percent}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full">
                    <div
                      className="h-1.5 rounded-full bg-accent"
                      style={{ width: `${Math.min(driver.percent * 1.5, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              {(!topDrivers || topDrivers.length === 0) && (
                <p className="text-sm text-muted-foreground">No driver data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Target className="w-4 h-4 text-muted-foreground" />
              Top Affected Segments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(topSegments || []).map((seg: any, i: number) => (
                <div key={seg.segment} className="flex items-center justify-between gap-2" data-testid={`segment-item-${i}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{seg.segment}</p>
                    <p className="text-xs text-muted-foreground">{seg.atRisk} at risk of {seg.total}</p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={seg.percent > 30 ? "bg-red-500/10 text-red-600 dark:text-red-400" : seg.percent > 15 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : ""}
                  >
                    {seg.percent}%
                  </Badge>
                </div>
              ))}
              {(!topSegments || topSegments.length === 0) && (
                <p className="text-sm text-muted-foreground">No segment data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-muted-foreground" />
              Immediate Risk Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(riskAlerts || []).map((alert: any, i: number) => (
                <div
                  key={i}
                  className={`p-2 rounded-md border text-sm ${SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.medium}`}
                  data-testid={`alert-item-${i}`}
                >
                  {alert.message}
                </div>
              ))}
              {(!riskAlerts || riskAlerts.length === 0) && (
                <p className="text-sm text-muted-foreground">No active alerts</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CommandCenterSkeleton() {
  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="command-center-skeleton">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
        <Skeleton className="h-80 lg:col-span-7" />
        <Skeleton className="h-80 lg:col-span-3" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-64" />)}
      </div>
    </div>
  );
}
