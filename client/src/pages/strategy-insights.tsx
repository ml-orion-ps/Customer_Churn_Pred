import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPICard } from "@/components/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe, Wifi, ArrowRightLeft, TrendingUp, TrendingDown, AlertTriangle, Users, DollarSign, Zap } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from "recharts";

const COLORS = ["hsl(210, 75%, 38%)", "hsl(185, 70%, 35%)", "hsl(25, 75%, 42%)", "hsl(280, 65%, 38%)", "hsl(140, 60%, 35%)"];
const RISK_COLORS = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" };

export default function StrategyInsights() {
  const [, params] = useRoute("/strategy/:tab");
  const [, navigate] = useLocation();
  const activeTab = params?.tab || "competitive";
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/analytics/strategy"] });

  if (isLoading) return <StrategyInsightsSkeleton />;
  if (!data) return null;

  const { competitiveLandscape, migrationIntelligence, networkHealth } = data;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="strategy-insights-page">
      <div>
        <h1 className="text-2xl font-bold">Strategy Insights</h1>
        <p className="text-sm text-muted-foreground mt-1">Competitive landscape, network health impact, and migration intelligence</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => navigate(`/strategy/${v}`)} className="space-y-4">
        <TabsList data-testid="strategy-tabs">
          <TabsTrigger value="competitive" data-testid="tab-competitive">
            <Globe className="w-4 h-4 mr-1.5" />
            Competitive Landscape
          </TabsTrigger>
          <TabsTrigger value="network" data-testid="tab-network">
            <Wifi className="w-4 h-4 mr-1.5" />
            Network Health
          </TabsTrigger>
          <TabsTrigger value="migration" data-testid="tab-migration">
            <ArrowRightLeft className="w-4 h-4 mr-1.5" />
            Migration Intelligence
          </TabsTrigger>
        </TabsList>

        <TabsContent value="competitive" className="space-y-4">
          <CompetitiveLandscape data={competitiveLandscape} />
        </TabsContent>

        <TabsContent value="network" className="space-y-4">
          <NetworkHealthImpact data={networkHealth} />
        </TabsContent>

        <TabsContent value="migration" className="space-y-4">
          <MigrationIntelligence data={migrationIntelligence} competitiveLandscape={competitiveLandscape} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CompetitiveLandscape({ data }: { data: any }) {
  if (!data) return null;

  const fiberComparison = [
    { zone: "Fiber Zones", churnRate: data.fiberZones?.churnRate || 0, total: data.fiberZones?.total || 0, churned: data.fiberZones?.churned || 0 },
    { zone: "Non-Fiber Zones", churnRate: data.nonFiberZones?.churnRate || 0, total: data.nonFiberZones?.total || 0, churned: data.nonFiberZones?.churned || 0 },
  ];

  const competitorComparison = [
    { zone: "Competitor Zones", churnRate: data.competitorZones?.churnRate || 0, total: data.competitorZones?.total || 0, churned: data.competitorZones?.churned || 0 },
    { zone: "No Competitor Zones", churnRate: data.nonCompetitorZones?.churnRate || 0, total: data.nonCompetitorZones?.total || 0, churned: data.nonCompetitorZones?.churned || 0 },
  ];

  const combinedCompare = [
    { name: "Fiber Zones", churnRate: data.fiberZones?.churnRate || 0, fill: "#ef4444" },
    { name: "Non-Fiber Zones", churnRate: data.nonFiberZones?.churnRate || 0, fill: "#22c55e" },
    { name: "Competitor Zones", churnRate: data.competitorZones?.churnRate || 0, fill: "#f59e0b" },
    { name: "No Competitor", churnRate: data.nonCompetitorZones?.churnRate || 0, fill: "hsl(210, 75%, 38%)" },
  ];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Fiber Zone Churn"
          value={`${data.fiberZones?.churnRate || 0}%`}
          subtitle={`${data.fiberZones?.churned || 0} of ${data.fiberZones?.total || 0} customers`}
          icon={TrendingUp}
          variant="danger"
        />
        <KPICard
          title="Non-Fiber Churn"
          value={`${data.nonFiberZones?.churnRate || 0}%`}
          subtitle={`${data.nonFiberZones?.churned || 0} of ${data.nonFiberZones?.total || 0} customers`}
          icon={TrendingDown}
          variant="success"
        />
        <KPICard
          title="Churn Lift (Fiber)"
          value={`+${data.churnLiftFromFiber || 0}pp`}
          subtitle="Additional churn from fiber presence"
          icon={AlertTriangle}
          variant={data.churnLiftFromFiber > 5 ? "danger" : "warning"}
        />
        <KPICard
          title="Churn Lift (Competitor)"
          value={`+${data.churnLiftFromCompetitor || 0}pp`}
          subtitle="Additional churn from competitor"
          icon={AlertTriangle}
          variant={data.churnLiftFromCompetitor > 5 ? "danger" : "warning"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              Churn Rate by Zone Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={combinedCompare} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" tick={{ fontSize: 11 }} unit="%" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value: number) => [`${value}%`, "Churn Rate"]}
                />
                <Bar dataKey="churnRate" radius={[0, 4, 4, 0]}>
                  {combinedCompare.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              Fiber vs Non-Fiber Zone Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {fiberComparison.map((zone) => (
                <div key={zone.zone} className="space-y-2" data-testid={`zone-${zone.zone.toLowerCase().replace(/\s+/g, '-')}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{zone.zone}</span>
                    <Badge variant={zone.churnRate > 30 ? "destructive" : "secondary"}>
                      {zone.churnRate}% churn
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-red-500 dark:bg-red-400 transition-all"
                        style={{ width: `${Math.min(zone.churnRate, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground min-w-[80px] text-right">{zone.churned} / {zone.total}</span>
                  </div>
                </div>
              ))}
              <div className="border-t pt-4 mt-4">
                <p className="text-xs text-muted-foreground mb-2">Competitor Presence Impact</p>
                {competitorComparison.map((zone) => (
                  <div key={zone.zone} className="space-y-2 mb-4" data-testid={`zone-${zone.zone.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{zone.zone}</span>
                      <Badge variant={zone.churnRate > 30 ? "destructive" : "secondary"}>
                        {zone.churnRate}% churn
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-500 dark:bg-amber-400 transition-all"
                          style={{ width: `${Math.min(zone.churnRate, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground min-w-[80px] text-right">{zone.churned} / {zone.total}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function NetworkHealthImpact({ data }: { data: any }) {
  if (!data) return null;

  const { outageCorrelation = [], speedCorrelation = [] } = data;

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Max Outage Churn"
          value={`${outageCorrelation.length > 0 ? Math.max(...outageCorrelation.map((d: any) => d.churnRate)) : 0}%`}
          subtitle="Highest churn in outage buckets"
          icon={Zap}
          variant="danger"
        />
        <KPICard
          title="Max Speed Gap Churn"
          value={`${speedCorrelation.length > 0 ? Math.max(...speedCorrelation.map((d: any) => d.churnRate)) : 0}%`}
          subtitle="Highest churn in speed gap buckets"
          icon={Wifi}
          variant="danger"
        />
        <KPICard
          title="Outage Buckets"
          value={outageCorrelation.length}
          subtitle="Data segments analyzed"
          icon={AlertTriangle}
          variant="default"
        />
        <KPICard
          title="Speed Buckets"
          value={speedCorrelation.length}
          subtitle="Degradation segments analyzed"
          icon={TrendingDown}
          variant="default"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-muted-foreground" />
              Outage Count vs Churn Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={outageCorrelation}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} label={{ value: "Outages", position: "insideBottom", offset: -2, fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value: number, name: string) => {
                    if (name === "churnRate") return [`${value}%`, "Churn Rate"];
                    return [value, name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="churnRate" name="Churn Rate (%)" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-2">Higher outage frequency correlates with increased churn probability</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Wifi className="w-4 h-4 text-muted-foreground" />
              Speed Degradation vs Churn Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={speedCorrelation}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} label={{ value: "Speed Gap", position: "insideBottom", offset: -2, fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value: number, name: string) => {
                    if (name === "churnRate") return [`${value}%`, "Churn Rate"];
                    return [value, name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="churnRate" name="Churn Rate (%)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-2">Larger gap between provisioned and actual speed increases churn risk</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-muted-foreground" />
            Detailed Correlation Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Outage Correlation</p>
              <div className="space-y-2">
                {outageCorrelation.map((d: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm" data-testid={`outage-row-${i}`}>
                    <span className="text-muted-foreground">{d.range} outages</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{d.total} customers</span>
                      <Badge variant={d.churnRate > 40 ? "destructive" : d.churnRate > 25 ? "secondary" : "outline"}>
                        {d.churnRate}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Speed Degradation Correlation</p>
              <div className="space-y-2">
                {speedCorrelation.map((d: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm" data-testid={`speed-row-${i}`}>
                    <span className="text-muted-foreground">{d.range} gap</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{d.total} customers</span>
                      <Badge variant={d.churnRate > 40 ? "destructive" : d.churnRate > 25 ? "secondary" : "outline"}>
                        {d.churnRate}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function MigrationIntelligence({ data, competitiveLandscape }: { data: any; competitiveLandscape: any }) {
  if (!data) return null;

  const migrationPieData = [
    { name: "High Risk Eligible", value: data.highRiskEligible || 0, fill: "#ef4444" },
    { name: "Other Eligible", value: Math.max(0, (data.eligibleCustomers || 0) - (data.highRiskEligible || 0)), fill: "hsl(210, 75%, 38%)" },
  ];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Fiber-Eligible Customers"
          value={data.eligibleCustomers?.toLocaleString() || 0}
          subtitle="Copper customers in fiber zones"
          icon={Users}
          variant="default"
        />
        <KPICard
          title="Revenue Potential"
          value={`$${((data.migrationRevenuePotential || 0) / 1000).toFixed(0)}K`}
          subtitle="Annual revenue from eligible base"
          icon={DollarSign}
          variant="success"
        />
        <KPICard
          title="Avg Revenue/Customer"
          value={`$${(data.avgRevenuePerCustomer || 0).toLocaleString()}`}
          subtitle="Per eligible customer annually"
          icon={TrendingUp}
          variant="default"
        />
        <KPICard
          title="High-Risk Eligible"
          value={data.highRiskEligible || 0}
          subtitle="Urgent migration candidates"
          icon={AlertTriangle}
          variant="danger"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
              Migration Candidate Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={240}>
                <PieChart>
                  <Pie data={migrationPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} strokeWidth={2}>
                    {migrationPieData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-3">
                {migrationPieData.map((item) => (
                  <div key={item.name} className="flex items-center gap-2" data-testid={`migration-${item.name.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.value} customers</p>
                    </div>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2">
                  <p className="text-xs text-muted-foreground">Total Eligible: {data.eligibleCustomers || 0}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              Competitive Pressure Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">Fiber Competition Impact</span>
                  <Badge variant={competitiveLandscape?.churnLiftFromFiber > 5 ? "destructive" : "secondary"}>
                    +{competitiveLandscape?.churnLiftFromFiber || 0}pp churn lift
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">Competitor Presence Impact</span>
                  <Badge variant={competitiveLandscape?.churnLiftFromCompetitor > 5 ? "destructive" : "secondary"}>
                    +{competitiveLandscape?.churnLiftFromCompetitor || 0}pp churn lift
                  </Badge>
                </div>
              </div>
              <div className="border-t pt-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Strategic Recommendations</p>
                <div className="space-y-2">
                  {(competitiveLandscape?.churnLiftFromFiber || 0) > 3 && (
                    <div className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                      <span>Prioritize fiber migration for copper customers in fiber-available zones to reduce competitive churn pressure</span>
                    </div>
                  )}
                  {(data.highRiskEligible || 0) > 0 && (
                    <div className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      <span>{data.highRiskEligible} high-risk customers eligible for fiber migration — immediate outreach recommended</span>
                    </div>
                  )}
                  {(competitiveLandscape?.churnLiftFromCompetitor || 0) > 3 && (
                    <div className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                      <span>Competitor presence adds {competitiveLandscape?.churnLiftFromCompetitor}pp to churn — consider proactive retention offers</span>
                    </div>
                  )}
                  <div className="flex items-start gap-2 text-sm">
                    <TrendingUp className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>${((data.migrationRevenuePotential || 0) / 1000).toFixed(0)}K annual revenue at stake from fiber-eligible base</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function StrategyInsightsSkeleton() {
  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-10 w-96" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}
