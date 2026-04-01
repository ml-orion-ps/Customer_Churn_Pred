import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingDown, DollarSign, AlertTriangle, BarChart3 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area
} from "recharts";

const COLORS = ["hsl(220, 65%, 28%)", "hsl(185, 70%, 35%)", "hsl(25, 85%, 55%)", "hsl(280, 65%, 38%)", "hsl(140, 60%, 35%)", "#6366f1"];
const RISK_COLORS: Record<string, string> = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" };

function formatCurrency(val: number) {
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

export default function ChurnDiagnostics() {
  const [, params] = useRoute("/churn-diagnostics/:tab");
  const [, navigate] = useLocation();
  const activeTab = params?.tab || "patterns";

  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/analytics/churn-diagnostics"] });
  const { data: segments } = useQuery<any>({ queryKey: ["/api/segments"] });

  if (isLoading) return <DiagnosticsSkeleton />;
  if (!data) return null;

  const { patterns, segments: segData, drivers, financialImpact } = data;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="churn-diagnostics-page">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Churn Diagnostics</h1>
        <p className="text-sm text-muted-foreground mt-1">Deep-dive analysis of customer churn patterns, drivers, segments, and financial impact</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => navigate(`/churn-diagnostics/${v}`)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="patterns" data-testid="tab-pattern-explorer">
            <TrendingDown className="w-4 h-4 mr-1.5" />
            Pattern Explorer
          </TabsTrigger>
          <TabsTrigger value="segments" data-testid="tab-segment-intelligence">
            <BarChart3 className="w-4 h-4 mr-1.5" />
            Segment Intelligence
          </TabsTrigger>
          <TabsTrigger value="drivers" data-testid="tab-driver-analysis">
            <AlertTriangle className="w-4 h-4 mr-1.5" />
            Driver Analysis
          </TabsTrigger>
          <TabsTrigger value="financial" data-testid="tab-financial-impact">
            <DollarSign className="w-4 h-4 mr-1.5" />
            Financial Impact
          </TabsTrigger>
        </TabsList>

        <TabsContent value="patterns" className="space-y-4">
          <PatternExplorer patterns={patterns} />
        </TabsContent>

        <TabsContent value="segments" className="space-y-4">
          <SegmentIntelligence segData={segData} segments={segments} />
        </TabsContent>

        <TabsContent value="drivers" className="space-y-4">
          <DriverAnalysis drivers={drivers} />
        </TabsContent>

        <TabsContent value="financial" className="space-y-4">
          <FinancialImpact financialImpact={financialImpact} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PatternExplorer({ patterns }: { patterns: any }) {
  const { monthlyTrend, tenureCohorts } = patterns;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Monthly Churn Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={monthlyTrend || []}>
                <defs>
                  <linearGradient id="churnGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Area type="monotone" dataKey="count" stroke="#ef4444" fill="url(#churnGrad)" strokeWidth={2} name="Churned Customers" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Monthly Revenue Lost</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={(monthlyTrend || []).map((m: any) => ({ ...m, revenue: parseFloat((m.revenue || 0).toFixed(0)) }))}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "Revenue Lost"]} />
                <Bar dataKey="revenue" fill="hsl(25, 85%, 55%)" name="Revenue Lost" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Tenure Cohort Retention Curve</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={tenureCohorts || []}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="retentionRate" fill="hsl(220, 65%, 28%)" name="Retention %" radius={[3, 3, 0, 0]} stackId="a" />
                  <Bar dataKey="churnRate" fill="#ef4444" name="Churn %" radius={[3, 3, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Cohort Details</p>
              {(tenureCohorts || []).map((c: any) => (
                <div key={c.bucket} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50" data-testid={`cohort-${c.bucket}`}>
                  <div>
                    <p className="text-sm font-medium">{c.bucket}</p>
                    <p className="text-xs text-muted-foreground">{c.total} customers</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold" style={{ color: c.churnRate > 30 ? "#ef4444" : c.churnRate > 20 ? "#f59e0b" : "#22c55e" }}>
                      {c.churnRate}%
                    </p>
                    <p className="text-xs text-muted-foreground">{c.churned} churned</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

const SEGMENT_TYPES = [
  { value: "valueTier", label: "Value Tier", dataKey: "byValueTier" },
  { value: "bundle", label: "Bundle Type", dataKey: "byBundle" },
  { value: "region", label: "Region", dataKey: "byRegion" },
  { value: "contract", label: "Contract Status", dataKey: "byContract" },
];

function SegmentIntelligence({ segData, segments }: { segData: any; segments: any }) {
  const [gridSegmentType, setGridSegmentType] = useState("valueTier");
  const selectedSegType = SEGMENT_TYPES.find(s => s.value === gridSegmentType)!;
  const gridData = segData?.[selectedSegType.dataKey] || [];

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Churn by Value Tier</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={segData?.byValueTier || []}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="churnRate" fill="#ef4444" name="Churn Rate %" radius={[3, 3, 0, 0]} />
                <Bar yAxisId="right" dataKey="avgRevenue" fill="hsl(220, 65%, 28%)" name="Avg Revenue $" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Churn by Bundle Type</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={segData?.byBundle || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={110} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="churnRate" fill="hsl(185, 70%, 35%)" name="Churn Rate %" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Churn by Region</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={segData?.byRegion || []}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="total" fill="hsl(220, 65%, 28%)" name="Total" radius={[3, 3, 0, 0]} />
                <Bar dataKey="churned" fill="#ef4444" name="Churned" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Churn by Contract Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={(segData?.byContract || []).map((c: any) => ({ ...c, displayName: `${c.name} (${c.churnRate}%)` }))}
                  dataKey="total"
                  nameKey="displayName"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={45}
                  strokeWidth={2}
                >
                  {(segData?.byContract || []).map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Segment Comparison: Fiber vs Non-Fiber Zones</CardTitle>
        </CardHeader>
        <CardContent>
          {segData?.segmentComparisons?.fiberVsNonFiber && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-md bg-muted/50" data-testid="segment-fiber">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Fiber Zones</p>
                <p className="text-2xl font-bold mt-1">{segData.segmentComparisons.fiberVsNonFiber.fiber.churnRate}%</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {segData.segmentComparisons.fiberVsNonFiber.fiber.churned} of {segData.segmentComparisons.fiberVsNonFiber.fiber.total} customers
                </p>
              </div>
              <div className="p-4 rounded-md bg-muted/50" data-testid="segment-non-fiber">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Non-Fiber Zones</p>
                <p className="text-2xl font-bold mt-1">{segData.segmentComparisons.fiberVsNonFiber.nonFiber.churnRate}%</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {segData.segmentComparisons.fiberVsNonFiber.nonFiber.churned} of {segData.segmentComparisons.fiberVsNonFiber.nonFiber.total} customers
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Segment Grid</CardTitle>
            <Select value={gridSegmentType} onValueChange={setGridSegmentType}>
              <SelectTrigger className="w-[180px] h-8 text-xs" data-testid="select-segment-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEGMENT_TYPES.map(st => (
                  <SelectItem key={st.value} value={st.value} data-testid={`option-segment-${st.value}`}>
                    {st.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto max-h-[400px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>{selectedSegType.label}</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Churned</TableHead>
                  <TableHead className="text-right">Churn Rate</TableHead>
                  <TableHead className="text-right">Avg Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gridData.map((seg: any) => (
                  <TableRow key={seg.name} data-testid={`row-segment-${seg.name}`}>
                    <TableCell className="font-medium">{seg.name}</TableCell>
                    <TableCell className="text-right">{seg.total}</TableCell>
                    <TableCell className="text-right">{seg.churned}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={seg.churnRate > 30 ? "destructive" : "secondary"} className="text-xs">
                        {seg.churnRate}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">${seg.avgRevenue}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function DriverAnalysis({ drivers }: { drivers: any }) {
  const { contributions, byRegion, bySegment } = drivers;

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Driver Contribution to Churn</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={contributions || []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, 'auto']} />
              <YAxis dataKey="driver" type="category" tick={{ fontSize: 11 }} width={140} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: any) => [`${v}%`, "Contribution"]} />
              <Bar dataKey="percent" name="Contribution %" radius={[0, 3, 3, 0]}>
                {(contributions || []).map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Driver Impact by Region</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Region</TableHead>
                    <TableHead className="text-right">Churn Rate</TableHead>
                    <TableHead className="text-right">Fiber Impact</TableHead>
                    <TableHead className="text-right">Quality Impact</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(byRegion || []).map((r: any) => (
                    <TableRow key={r.name} data-testid={`row-driver-region-${r.name}`}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={r.churnRate > 30 ? "destructive" : "secondary"} className="text-xs">
                          {r.churnRate}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{r.fiberImpact}%</TableCell>
                      <TableCell className="text-right">{r.qualityImpact}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Driver Impact by Value Segment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Segment</TableHead>
                    <TableHead className="text-right">Churn Rate</TableHead>
                    <TableHead className="text-right">Fiber Impact</TableHead>
                    <TableHead className="text-right">Quality Impact</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(bySegment || []).map((s: any) => (
                    <TableRow key={s.name} data-testid={`row-driver-segment-${s.name}`}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={s.churnRate > 30 ? "destructive" : "secondary"} className="text-xs">
                          {s.churnRate}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{s.fiberImpact}%</TableCell>
                      <TableCell className="text-right">{s.qualityImpact}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function FinancialImpact({ financialImpact }: { financialImpact: any }) {
  const { revenueLostByReason, revenueLostBySegment, revenueLostByRegion, kpis } = financialImpact;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Annual Revenue Lost</p>
            <p className="text-3xl font-bold mt-2 text-red-500" data-testid="text-total-rev-lost">
              {formatCurrency(kpis?.totalAnnualRevenueLost || 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">From churned copper customers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg Revenue per Churned Customer</p>
            <p className="text-3xl font-bold mt-2" data-testid="text-avg-rev-churned">
              {formatCurrency(kpis?.avgRevenuePerChurned || 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Annual per customer</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Revenue at Risk</p>
            <p className="text-3xl font-bold mt-2 text-amber-500" data-testid="text-rev-at-risk">
              {formatCurrency(kpis?.revenueAtRisk || 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">From high-risk active customers</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Revenue Lost by Churn Reason</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={revenueLostByReason || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v)} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={130} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: any) => [formatCurrency(Number(v)), "Revenue Lost"]} />
                <Bar dataKey="value" name="Revenue Lost" radius={[0, 3, 3, 0]}>
                  {(revenueLostByReason || []).map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Revenue Lost by Value Segment</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={revenueLostBySegment || []}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: any) => [formatCurrency(Number(v)), "Revenue Lost"]} />
                <Bar dataKey="value" fill="hsl(25, 85%, 55%)" name="Revenue Lost" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Revenue Lost by Region</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={revenueLostByRegion || []}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: any) => [formatCurrency(Number(v)), "Revenue Lost"]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="value" fill="hsl(220, 65%, 28%)" name="Annual Revenue Lost" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </>
  );
}

function DiagnosticsSkeleton() {
  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <Skeleton className="h-10 w-[500px]" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-[360px]" />
        <Skeleton className="h-[360px]" />
      </div>
      <Skeleton className="h-[340px]" />
    </div>
  );
}
