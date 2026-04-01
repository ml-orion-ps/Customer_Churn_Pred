import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, Eye, AlertTriangle, TrendingDown, Users, DollarSign, ShieldAlert,
  Activity, BarChart3, Signal
} from "lucide-react";
import { KPICard } from "@/components/kpi-card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area
} from "recharts";

const RISK_COLORS: Record<string, string> = { High: "#ef4444", Medium: "#f59e0b", Low: "#22c55e", high: "#ef4444", medium: "#f59e0b", low: "#22c55e" };
const RISK_BG: Record<string, string> = {
  High: "bg-red-500/10 text-red-600 dark:text-red-400",
  Medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Low: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

export default function RiskIntelligence() {
  const [, params] = useRoute("/risk-intelligence/:tab");
  const [, navigate] = useLocation();
  const activeTab = params?.tab || "overview";

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="risk-intelligence-page">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Customer Risk Intelligence</h1>
        <p className="text-sm text-muted-foreground mt-1">Risk distribution, customer-level scoring, and early warning signals</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => navigate(`/risk-intelligence/${v}`)}>
        <TabsList data-testid="tabs-risk-intelligence">
          <TabsTrigger value="overview" data-testid="tab-overview">Risk Overview</TabsTrigger>
          <TabsTrigger value="explorer" data-testid="tab-explorer">Customer Risk Explorer</TabsTrigger>
          <TabsTrigger value="warnings" data-testid="tab-warnings">Early Warning Signals</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <RiskOverviewTab />
        </TabsContent>
        <TabsContent value="explorer" className="mt-4">
          <CustomerRiskExplorerTab />
        </TabsContent>
        <TabsContent value="warnings" className="mt-4">
          <EarlyWarningTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RiskOverviewTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/analytics/risk-intelligence"] });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-[400px]" /></div>;
  if (!data) return null;

  const { riskDistribution, riskByRegion, riskByTenure, probabilityCurve } = data;

  const totalAtRisk = (riskDistribution?.high || 0) + (riskDistribution?.medium || 0);
  const totalActive = (riskDistribution?.high || 0) + (riskDistribution?.medium || 0) + (riskDistribution?.low || 0);
  const highRiskPct = totalActive > 0 ? ((riskDistribution?.high || 0) / totalActive * 100).toFixed(1) : "0";

  const pieData = [
    { name: "High", value: riskDistribution?.high || 0 },
    { name: "Medium", value: riskDistribution?.medium || 0 },
    { name: "Low", value: riskDistribution?.low || 0 },
  ];

  return (
    <div className="space-y-4" data-testid="risk-overview-content">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Active" value={totalActive} subtitle="Monitored customers" icon={Users} variant="default" />
        <KPICard title="High Risk" value={riskDistribution?.high || 0} subtitle={`${highRiskPct}% of active`} icon={AlertTriangle} variant="danger" />
        <KPICard title="Medium Risk" value={riskDistribution?.medium || 0} subtitle="Elevated churn probability" icon={ShieldAlert} variant="warning" />
        <KPICard title="Low Risk" value={riskDistribution?.low || 0} subtitle="Stable customers" icon={Activity} variant="success" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Risk Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={40} strokeWidth={2}>
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={RISK_COLORS[entry.name]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-2">
              {pieData.map(entry => (
                <div key={entry.name} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RISK_COLORS[entry.name] }} />
                    <span className="text-sm">{entry.name}</span>
                  </div>
                  <span className="text-sm font-medium" data-testid={`text-risk-count-${entry.name.toLowerCase()}`}>{entry.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Churn Probability Curve</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={probabilityCurve || []}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Area type="monotone" dataKey="count" name="Customers" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Risk by Region</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={riskByRegion || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="region" type="category" tick={{ fontSize: 10 }} width={100} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="high" name="High" stackId="a" fill="#ef4444" radius={0} />
                <Bar dataKey="medium" name="Medium" stackId="a" fill="#f59e0b" radius={0} />
                <Bar dataKey="low" name="Low" stackId="a" fill="#22c55e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Risk by Tenure</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={riskByTenure || []}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="tenure" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="high" name="High" stackId="a" fill="#ef4444" radius={0} />
                <Bar dataKey="medium" name="Medium" stackId="a" fill="#f59e0b" radius={0} />
                <Bar dataKey="low" name="Low" stackId="a" fill="#22c55e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CustomerRiskExplorerTab() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");

  const { data: customersData, isLoading } = useQuery<any>({ queryKey: ["/api/customers", "?churned=false&limit=500"] });

  // Fetch SHAP drivers for all customers
  const { data: shapData } = useQuery<any>({
    queryKey: ["/api/customers/shap-drivers"],
    queryFn: async () => {
      const response = await fetch("/api/customers/shap-drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: 1 }), // Use the latest trained model
      });
      if (!response.ok) throw new Error("Failed to fetch SHAP drivers");
      return response.json();
    },
    enabled: !!customersData?.data?.length,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Create a map of accountId -> SHAP data for quick lookup
  const shapMap = useMemo(() => {
    if (!shapData?.predictions) return new Map();
    return new Map(shapData.predictions.map((p: any) => [p.accountId, p]));
  }, [shapData]);

  if (isLoading) return <Skeleton className="h-[600px]" />;

  const customersList = customersData?.data || [];

  const regions = Array.from(new Set(customersList.map((c: any) => c.region))).sort() as string[];

  const filtered = customersList.filter((c: any) => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.accountNumber.toLowerCase().includes(search.toLowerCase());
    const matchRisk = riskFilter === "all" || c.churnRiskCategory === riskFilter;
    const matchRegion = regionFilter === "all" || c.region === regionFilter;
    return matchSearch && matchRisk && matchRegion;
  });

  const highRisk = customersList.filter((c: any) => c.churnRiskCategory === "High");
  const totalRevenueAtRisk = highRisk.reduce((sum: number, c: any) => sum + (c.monthlyRevenue || 0), 0);

  return (
    <div className="space-y-4" data-testid="risk-explorer-content">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="High Risk Customers" value={highRisk.length} subtitle="Churn probability > 70%" icon={AlertTriangle} variant="danger" />
        <KPICard title="Revenue at Risk" value={`$${(totalRevenueAtRisk / 1000).toFixed(0)}K/mo`} subtitle="From high-risk accounts" icon={DollarSign} variant="warning" />
        <KPICard title="Active Monitored" value={customersList.length} subtitle="With risk scores" icon={Users} variant="default" />
        <KPICard title="Avg Risk Score" value={`${(customersList.reduce((s: number, c: any) => s + (c.churnRiskScore || 0), 0) / Math.max(customersList.length, 1) * 100).toFixed(0)}%`} subtitle="Across all active accounts" icon={TrendingDown} variant="default" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-sm font-semibold">Customer Risk Table</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-56" data-testid="input-search-customers" />
              </div>
              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger className="w-36" data-testid="select-risk-filter">
                  <SelectValue placeholder="All Risks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Risks</SelectItem>
                  <SelectItem value="High">High Risk</SelectItem>
                  <SelectItem value="Medium">Medium Risk</SelectItem>
                  <SelectItem value="Low">Low Risk</SelectItem>
                </SelectContent>
              </Select>
              <Select value={regionFilter} onValueChange={setRegionFilter}>
                <SelectTrigger className="w-40" data-testid="select-region-filter">
                  <SelectValue placeholder="All Regions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Regions</SelectItem>
                  {regions.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto max-h-[450px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="text-xs">Account</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs">Region</TableHead>
                  <TableHead className="text-xs">Revenue</TableHead>
                  <TableHead className="text-xs">Risk Score</TableHead>
                  <TableHead className="text-xs">Risk Level</TableHead>
                  <TableHead className="text-xs">Key Driver</TableHead>
                  <TableHead className="text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 50).map((c: any) => (
                  <TableRow key={c.id} data-testid={`row-customer-${c.id}`}>
                    <TableCell className="text-xs font-mono">{c.accountNumber}</TableCell>
                    <TableCell className="text-xs font-medium">{c.name}</TableCell>
                    <TableCell className="text-xs">{c.region}</TableCell>
                    <TableCell className="text-xs">${c.monthlyRevenue?.toFixed(0)}/mo</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-2">
                        <Progress value={(c.churnRiskScore || 0) * 100} className="h-1.5 w-16" />
                        <span>{((c.churnRiskScore || 0) * 100).toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={RISK_BG[c.churnRiskCategory || "Low"]} variant="secondary">
                        {c.churnRiskCategory}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {getKeyDriver(c, shapMap)}
                    </TableCell>
                    <TableCell>
                      <CustomerProfileDialog customer={c} shapMap={shapMap} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground mt-2" data-testid="text-results-count">
            Showing {Math.min(filtered.length, 50)} of {filtered.length} results
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function getKeyDriver(c: any, shapMap?: Map<string, any>): string {
  // Try to get SHAP-based driver first
  if (shapMap) {
    const shapData = shapMap.get(c.accountNumber);
    if (shapData?.top3DriversStr) {
      return shapData.top3DriversStr;
    }
  }
  
  // Fallback to rule-based driver
  if (c.fiberAvailable && c.competitorAvailable) return "Fiber + Competitor";
  if (c.fiberAvailable) return "Fiber available";
  if ((c.outageCount || 0) > 3) return "High outages";
  if (c.competitorAvailable) return "Competitor present";
  if ((c.npsScore || 10) < 5) return "Low NPS";
  if ((c.ticketCount || 0) > 5) return "High tickets";
  if (c.contractStatus === "month-to-month") return "Month-to-month";
  return "General";
}

function CustomerProfileDialog({ customer, shapMap }: { customer: any; shapMap?: Map<string, any> }) {
  const [open, setOpen] = useState(false);
  const { data: detail, isLoading } = useQuery<any>({
    queryKey: ["/api/customers", customer.id],
    enabled: open,
  });

  const cust = detail?.customer || customer;
  const recs = detail?.recommendations || [];

  // Try to get SHAP-based drivers first
  const shapData = shapMap?.get(cust.accountNumber);
  const hasShapDrivers = shapData?.top3Drivers?.length > 0;

  // Use SHAP drivers if available, otherwise fall back to rule-based drivers
  const riskDrivers = hasShapDrivers
    ? shapData.top3Drivers.map((d: any) => ({
        driver: d.feature,
        active: true,
        impact: d.impact || `${(d.shapValue * 100).toFixed(1)}%`,
        severity: Math.abs(d.shapValue) > 0.15 ? "high" : Math.abs(d.shapValue) > 0.08 ? "medium" : "low",
        shapValue: d.shapValue,
        featureValue: d.value,
      }))
    : [
        { driver: "Fiber Available", active: cust.fiberAvailable, impact: "+15%", severity: "high" },
        { driver: "Competitor Present", active: cust.competitorAvailable, impact: "+12%", severity: "high" },
        { driver: "High Outages", active: (cust.outageCount || 0) > 4, impact: "+15%", severity: "high" },
        { driver: "Low NPS", active: (cust.npsScore || 10) < 30, impact: "+12%", severity: "medium" },
        { driver: "Speed Degradation", active: cust.provisionedSpeed > 0 && (cust.actualSpeed / cust.provisionedSpeed) < 0.6, impact: "+10%", severity: "medium" },
        { driver: "Short Tenure", active: (cust.tenureMonths || 0) < 12, impact: "+8%", severity: "low" },
        { driver: "Month-to-Month", active: cust.contractStatus === "month-to-month", impact: "+10%", severity: "medium" },
        { driver: "High Ticket Volume", active: (cust.ticketCount || 0) > 5, impact: "+7%", severity: "low" },
      ].filter(d => d.active);

  const speedRatio = cust.provisionedSpeed > 0 ? ((cust.actualSpeed || 0) / cust.provisionedSpeed * 100).toFixed(0) : "N/A";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" data-testid={`button-view-${customer.id}`}>
          <Eye className="w-3.5 h-3.5 mr-1" />
          Profile
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {cust.name}
            <Badge className={RISK_BG[cust.churnRiskCategory || "Low"]} variant="secondary">
              {cust.churnRiskCategory} Risk
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-[200px]" />
        ) : (
          <div className="space-y-5">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Customer Details</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <InfoItem label="Account" value={cust.accountNumber} />
                <InfoItem label="Region" value={`${cust.state}, ${cust.region}`} />
                <InfoItem label="Tenure" value={`${cust.tenureMonths} months`} />
                <InfoItem label="Revenue" value={`$${cust.monthlyRevenue?.toFixed(2)}/mo`} />
                <InfoItem label="Contract" value={cust.contractStatus} />
                <InfoItem label="Value Tier" value={cust.valueTier} />
                <InfoItem label="Bundle" value={cust.bundleType || "None"} />
                <InfoItem label="Lifecycle" value={cust.lifecycleStage || "Active"} />
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Risk Assessment</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Overall Risk Score:</span>
                  <div className="flex-1">
                    <Progress value={(cust.churnRiskScore || 0) * 100} className="h-3" />
                  </div>
                  <span className="text-sm font-bold" data-testid="text-risk-score">{((cust.churnRiskScore || 0) * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Usage & Service Behavior</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <InfoItem label="Provisioned Speed" value={`${cust.provisionedSpeed || 0} Mbps`} />
                <InfoItem label="Actual Speed" value={`${cust.actualSpeed || 0} Mbps`} />
                <InfoItem label="Speed Delivery" value={`${speedRatio}%`} />
                <InfoItem label="NPS Score" value={String(cust.npsScore ?? "N/A")} />
                <InfoItem label="Outages" value={String(cust.outageCount || 0)} />
                <InfoItem label="Tickets" value={String(cust.ticketCount || 0)} />
                <InfoItem label="Avg Resolution" value={`${(cust.avgResolutionHours || 0).toFixed(1)}h`} />
                <InfoItem label="Last Bill" value={`$${(cust.lastBillAmount || 0).toFixed(2)}`} />
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Risk Drivers ({riskDrivers.length} active) {hasShapDrivers && <Badge variant="outline" className="ml-2 text-[9px]">SHAP Analysis</Badge>}
              </h4>
              {riskDrivers.length > 0 ? (
                <div className="space-y-1.5">
                  {riskDrivers.map((d: any) => (
                    <div key={d.driver} className="flex items-center justify-between gap-2 p-2 rounded-md bg-red-500/5 dark:bg-red-500/10">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm">{d.driver}</span>
                        {hasShapDrivers && d.featureValue !== undefined && (
                          <span className="text-xs text-muted-foreground ml-2">
                            (Value: {typeof d.featureValue === 'number' ? d.featureValue.toFixed(2) : d.featureValue})
                          </span>
                        )}
                      </div>
                      <Badge variant="destructive" className="text-[10px]">{d.impact}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No significant risk drivers identified</p>
              )}
            </div>

            {recs.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Recommended Actions ({recs.length})
                </h4>
                <div className="space-y-1.5">
                  {recs.map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 p-2 rounded-md border">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{r.description}</p>
                        <p className="text-xs text-muted-foreground">{r.actionType} &middot; {r.priority} priority</p>
                      </div>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {r.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EarlyWarningTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/analytics/risk-intelligence"] });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-[400px]" /></div>;
  if (!data) return null;

  const { earlyWarnings, probabilityCurve } = data;

  const criticalCount = (earlyWarnings || []).filter((w: any) => (w.riskScore || 0) > 0.8).length;
  const elevatedCount = (earlyWarnings || []).filter((w: any) => (w.riskScore || 0) > 0.5 && (w.riskScore || 0) <= 0.8).length;
  const totalRevAtRisk = (earlyWarnings || []).reduce((s: number, w: any) => s + (w.revenue || 0), 0);

  return (
    <div className="space-y-4" data-testid="early-warning-content">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Critical Warnings" value={criticalCount} subtitle="Risk score > 80%" icon={AlertTriangle} variant="danger" />
        <KPICard title="Elevated Risk" value={elevatedCount} subtitle="Risk score 50-80%" icon={ShieldAlert} variant="warning" />
        <KPICard title="Revenue Exposed" value={`$${(totalRevAtRisk / 1000).toFixed(0)}K/mo`} subtitle="From flagged accounts" icon={DollarSign} variant="warning" />
        <KPICard title="Total Flagged" value={(earlyWarnings || []).length} subtitle="Customers with rising risk" icon={Signal} variant="default" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Early Warning Signals — Customers with Rising Risk</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <div className="space-y-3">
              {(earlyWarnings || []).map((w: any) => (
                <div
                  key={w.id}
                  className="p-3 rounded-md border flex flex-col gap-2"
                  data-testid={`warning-card-${w.id}`}
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium truncate" data-testid={`text-warning-name-${w.id}`}>{w.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">{w.accountNumber}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Revenue</p>
                        <p className="text-sm font-medium">${(w.revenue || 0).toFixed(0)}/mo</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Region</p>
                        <p className="text-sm font-medium">{w.region}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={(w.riskScore || 0) * 100} className="h-2 w-20" />
                        <Badge
                          className={(w.riskScore || 0) > 0.7 ? RISK_BG["High"] : RISK_BG["Medium"]}
                          variant="secondary"
                        >
                          {((w.riskScore || 0) * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    </div>
                  </div>
                  {w.signals && w.signals.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {w.signals.map((signal: string, idx: number) => (
                        <Badge key={idx} variant="outline" className="text-[10px]">
                          {signal}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {(!earlyWarnings || earlyWarnings.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-8">No early warning signals detected</p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
