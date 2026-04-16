import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPICard } from "@/components/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, TrendingUp, ArrowRightLeft, Shield, BarChart3, PiggyBank } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";

const COLORS = ["hsl(210, 75%, 38%)", "hsl(185, 70%, 35%)", "hsl(25, 75%, 42%)", "hsl(280, 65%, 38%)", "hsl(140, 60%, 35%)"];

export default function BusinessImpact() {
  const [, params] = useRoute("/business-impact/:tab");
  const [, navigate] = useLocation();
  const activeTab = params?.tab || "revenue";
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/analytics/business-impact"] });

  if (isLoading) return <BusinessImpactSkeleton />;
  if (!data) return null;

  const { revenueProtection, roiByAction, migrationEconomics } = data;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="business-impact-page">
      <div>
        <h1 className="text-2xl font-bold">Business Impact</h1>
        <p className="text-sm text-muted-foreground mt-1">Financial metrics, ROI analysis, and migration economics</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => navigate(`/business-impact/${v}`)} className="space-y-4">
        <TabsList data-testid="business-impact-tabs">
          <TabsTrigger value="revenue" data-testid="tab-revenue-protection">Revenue Protection</TabsTrigger>
          <TabsTrigger value="roi" data-testid="tab-roi-analysis">ROI Analysis</TabsTrigger>
          <TabsTrigger value="migration" data-testid="tab-migration-economics">Migration Economics</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="space-y-4">
          <RevenueProtectionTab revenueProtection={revenueProtection} />
        </TabsContent>

        <TabsContent value="roi" className="space-y-4">
          <ROIAnalysisTab roiByAction={roiByAction} />
        </TabsContent>

        <TabsContent value="migration" className="space-y-4">
          <MigrationEconomicsTab migrationEconomics={migrationEconomics} revenueProtection={revenueProtection} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RevenueProtectionTab({ revenueProtection }: { revenueProtection: any }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          title="Revenue Protected"
          value={`$${(revenueProtection.revenueProtected / 1000).toFixed(0)}K`}
          subtitle="From successful interventions"
          icon={Shield}
          variant="success"
        />
        <KPICard
          title="Intervention Cost"
          value={`$${(revenueProtection.interventionCost / 1000).toFixed(0)}K`}
          subtitle="Total cost of retention actions"
          icon={DollarSign}
          variant="warning"
        />
        <KPICard
          title="ROI Multiple"
          value={`${revenueProtection.roiMultiple}x`}
          subtitle="Return on intervention spend"
          icon={TrendingUp}
          variant={revenueProtection.roiMultiple >= 2 ? "success" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              Revenue Protected by Segment
            </CardTitle>
          </CardHeader>
          <CardContent>
            {revenueProtection.savedBySegment && revenueProtection.savedBySegment.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={revenueProtection.savedBySegment}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [`$${v.toLocaleString()}`, "Revenue Protected"]} />
                  <Bar dataKey="value" fill="hsl(140, 60%, 35%)" name="Revenue Protected" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground" data-testid="text-no-segment-data">
                No segment data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              Revenue Protected by Region
            </CardTitle>
          </CardHeader>
          <CardContent>
            {revenueProtection.savedByRegion && revenueProtection.savedByRegion.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={revenueProtection.savedByRegion} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [`$${v.toLocaleString()}`, "Revenue Protected"]} />
                  <Bar dataKey="value" fill="hsl(210, 75%, 38%)" name="Revenue Protected" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground" data-testid="text-no-region-data">
                No region data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ROIAnalysisTab({ roiByAction }: { roiByAction: any[] }) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              ROI by Action Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            {roiByAction && roiByAction.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={roiByAction}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="action" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="roi" fill="hsl(25, 75%, 42%)" name="ROI Multiple" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground" data-testid="text-no-roi-data">
                No ROI data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              Cost vs Impact by Action
            </CardTitle>
          </CardHeader>
          <CardContent>
            {roiByAction && roiByAction.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={roiByAction}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="action" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="cost" fill="hsl(0, 70%, 50%)" name="Cost" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="impact" fill="hsl(140, 60%, 35%)" name="Impact" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground" data-testid="text-no-cost-impact-data">
                No cost/impact data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {roiByAction && roiByAction.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Action Performance Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto max-h-[400px]">
              <table className="w-full text-sm" data-testid="table-action-performance">
                <thead className="sticky top-0 bg-background z-10">
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Action Type</th>
                    <th className="text-right py-2 px-4 font-medium text-muted-foreground">Count</th>
                    <th className="text-right py-2 px-4 font-medium text-muted-foreground">Cost</th>
                    <th className="text-right py-2 px-4 font-medium text-muted-foreground">Impact</th>
                    <th className="text-right py-2 px-4 font-medium text-muted-foreground">ROI</th>
                    <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Success Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {roiByAction.map((row: any, i: number) => (
                    <tr key={row.action} className="border-b last:border-0" data-testid={`row-action-${i}`}>
                      <td className="py-2 pr-4 font-medium">{row.action}</td>
                      <td className="text-right py-2 px-4">{row.count}</td>
                      <td className="text-right py-2 px-4">${row.cost.toLocaleString()}</td>
                      <td className="text-right py-2 px-4">${row.impact.toLocaleString()}</td>
                      <td className="text-right py-2 px-4">
                        <Badge variant={row.roi >= 2 ? "default" : "secondary"}>
                          {row.roi}x
                        </Badge>
                      </td>
                      <td className="text-right py-2 pl-4">{row.successRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function MigrationEconomicsTab({ migrationEconomics, revenueProtection }: { migrationEconomics: any; revenueProtection: any }) {
  const migrationData = [
    { name: "Eligible Customers", value: migrationEconomics.fiberEligibleCustomers },
    { name: "Revenue Potential", value: migrationEconomics.migrationPotentialRevenue },
    { name: "Avg per Customer", value: migrationEconomics.avgRevenuePerMigration },
  ];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Fiber-Eligible Customers"
          value={migrationEconomics.fiberEligibleCustomers.toLocaleString()}
          subtitle="Eligible for migration"
          icon={ArrowRightLeft}
          variant="default"
        />
        <KPICard
          title="Migration Revenue Potential"
          value={`$${(migrationEconomics.migrationPotentialRevenue / 1000).toFixed(0)}K`}
          subtitle="Annual revenue at stake"
          icon={DollarSign}
          variant="warning"
        />
        <KPICard
          title="Avg Revenue per Migration"
          value={`$${migrationEconomics.avgRevenuePerMigration.toLocaleString()}`}
          subtitle="Per customer annual value"
          icon={PiggyBank}
          variant="success"
        />
        <KPICard
          title="High-Risk in Fiber Zones"
          value={`${migrationEconomics.currentChurnInFiberZones}%`}
          subtitle="Churn risk in fiber areas"
          icon={Shield}
          variant="danger"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              Intervention ROI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={[
                { name: "Revenue Protected", value: revenueProtection.revenueProtected },
                { name: "Intervention Cost", value: revenueProtection.interventionCost },
                { name: "Net Benefit", value: revenueProtection.revenueProtected - revenueProtection.interventionCost },
              ]} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`} />
                <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [`$${v.toLocaleString()}`, ""]} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  <Cell fill="hsl(140, 60%, 35%)" />
                  <Cell fill="#ef4444" />
                  <Cell fill="hsl(210, 75%, 38%)" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 pt-3 border-t grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">ROI Multiple</p>
                <p className="text-lg font-bold" data-testid="text-intervention-roi">
                  {revenueProtection.interventionCost > 0 ? `${(revenueProtection.revenueProtected / revenueProtection.interventionCost).toFixed(1)}x` : "N/A"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Migration Potential</p>
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400" data-testid="text-migration-potential">
                  ${(migrationEconomics.migrationPotentialRevenue / 1000).toFixed(0)}K
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
              Migration Opportunity Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={240}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "High Risk", value: Math.round(migrationEconomics.fiberEligibleCustomers * migrationEconomics.currentChurnInFiberZones / 100) },
                      { name: "Stable", value: migrationEconomics.fiberEligibleCustomers - Math.round(migrationEconomics.fiberEligibleCustomers * migrationEconomics.currentChurnInFiberZones / 100) },
                    ]}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={50}
                    strokeWidth={2}
                  >
                    <Cell fill="#ef4444" />
                    <Cell fill="hsl(210, 75%, 38%)" />
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-4 flex-1">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-sm">High Risk in Fiber Zones</span>
                  </div>
                  <p className="text-lg font-bold pl-5">
                    {Math.round(migrationEconomics.fiberEligibleCustomers * migrationEconomics.currentChurnInFiberZones / 100)}
                  </p>
                  <p className="text-xs text-muted-foreground pl-5">Priority migration targets</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "hsl(210, 75%, 38%)" }} />
                    <span className="text-sm">Stable Customers</span>
                  </div>
                  <p className="text-lg font-bold pl-5">
                    {migrationEconomics.fiberEligibleCustomers - Math.round(migrationEconomics.fiberEligibleCustomers * migrationEconomics.currentChurnInFiberZones / 100)}
                  </p>
                  <p className="text-xs text-muted-foreground pl-5">Standard migration timeline</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function BusinessImpactSkeleton() {
  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-5 w-72" />
      <Skeleton className="h-10 w-96" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2].map(i => <Skeleton key={i} className="h-72" />)}
      </div>
    </div>
  );
}
