import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { KPICard } from "@/components/kpi-card";
import { useRoute, useLocation } from "wouter";
import { useState } from "react";
import {
  Target, CheckCircle, Clock, XCircle, DollarSign, TrendingUp,
  Zap, Shield, Play, Search, Filter, BarChart3, Activity, Users
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  pending: { color: "bg-amber-500/10 text-amber-600 dark:text-amber-400", icon: Clock, label: "Pending" },
  in_progress: { color: "bg-blue-500/10 text-blue-600 dark:text-blue-400", icon: Zap, label: "In Progress" },
  completed: { color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", icon: CheckCircle, label: "Completed" },
  declined: { color: "bg-red-500/10 text-red-600 dark:text-red-400", icon: XCircle, label: "Declined" },
};

const PRIORITY_VARIANT: Record<string, "destructive" | "secondary" | "default"> = {
  Critical: "destructive",
  High: "destructive",
  Medium: "secondary",
  Low: "secondary",
};

const ACTION_COLORS = [
  "hsl(210, 75%, 38%)",
  "hsl(185, 70%, 35%)",
  "hsl(25, 75%, 42%)",
  "hsl(150, 60%, 35%)",
  "hsl(280, 50%, 45%)",
];

export default function RetentionCenter() {
  const [, params] = useRoute("/retention/:tab");
  const [, navigate] = useLocation();
  const activeTab = params?.tab || "actions";
  const { data: retentionData, isLoading } = useQuery<any>({ queryKey: ["/api/analytics/retention"] });
  const { toast } = useToast();
  const [queueFilter, setQueueFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [actionSort, setActionSort] = useState("risk");

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/recommendations/${id}`, {
        status,
        executedAt: status === "completed" ? new Date().toISOString() : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/retention"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations"] });
      toast({ title: "Action status updated" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6" data-testid="retention-center-loading">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[500px]" />
      </div>
    );
  }

  const { recommendedActions = [], queue = {}, tracker = {} } = retentionData || {};
  const pending = queue.pending || [];
  const inProgress = queue.inProgress || [];
  const completed = queue.completed || [];
  const declined = queue.declined || [];
  const allQueue = [...pending, ...inProgress, ...completed, ...declined];

  const filteredQueue = allQueue
    .filter((r: any) => {
      if (queueFilter !== "all" && r.status !== queueFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          (r.customerName || "").toLowerCase().includes(term) ||
          (r.description || "").toLowerCase().includes(term) ||
          (r.actionType || "").toLowerCase().includes(term) ||
          String(r.customerId).includes(term)
        );
      }
      return true;
    });

  const sortedActions = [...recommendedActions].sort((a: any, b: any) => {
    if (actionSort === "risk") return (b.riskScore || 0) - (a.riskScore || 0);
    if (actionSort === "roi") return (b.roi || 0) - (a.roi || 0);
    if (actionSort === "impact") return (b.estimatedImpact || 0) - (a.estimatedImpact || 0);
    if (actionSort === "cost") return (a.estimatedCost || 0) - (b.estimatedCost || 0);
    return 0;
  });

  const actionTypeBreakdown = Object.entries(
    allQueue.reduce((acc: Record<string, number>, r: any) => {
      const t = r.actionType || "Other";
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  const statusBreakdown = [
    { name: "Pending", value: pending.length, fill: "hsl(38, 92%, 50%)" },
    { name: "In Progress", value: inProgress.length, fill: "hsl(210, 75%, 50%)" },
    { name: "Completed", value: completed.length, fill: "hsl(150, 60%, 40%)" },
    { name: "Declined", value: declined.length, fill: "hsl(0, 70%, 50%)" },
  ].filter(s => s.value > 0);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="retention-center-page">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Retention Action Center</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage retention interventions, track execution, and measure save outcomes
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Actions Triggered"
          value={tracker.actionsTriggered || 0}
          subtitle={`${pending.length} pending review`}
          icon={Target}
          variant="default"
        />
        <KPICard
          title="Save Success Rate"
          value={`${tracker.saveSuccessRate || 0}%`}
          subtitle={`${tracker.actionsExecuted || 0} executed`}
          icon={Shield}
          variant="success"
        />
        <KPICard
          title="Revenue Impact"
          value={`$${((tracker.totalImpactGenerated || 0) / 1000).toFixed(0)}K`}
          subtitle="From successful saves"
          icon={DollarSign}
          variant="success"
        />
        <KPICard
          title="Avg Resolution"
          value={`${tracker.avgResolutionDays || 0}d`}
          subtitle={`$${((tracker.totalCostSpent || 0) / 1000).toFixed(0)}K spent`}
          icon={Clock}
          variant="default"
        />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => navigate(`/retention/${v}`)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="actions" data-testid="tab-recommended-actions">Recommended Actions</TabsTrigger>
          <TabsTrigger value="queue" data-testid="tab-intervention-queue">Intervention Queue</TabsTrigger>
          <TabsTrigger value="tracker" data-testid="tab-execution-tracker">Execution Tracker</TabsTrigger>
        </TabsList>

        <TabsContent value="actions" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by customer, action..."
                className="w-64"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-actions"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={actionSort} onValueChange={setActionSort}>
                <SelectTrigger className="w-40" data-testid="select-sort-actions">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="risk">Risk Score</SelectItem>
                  <SelectItem value="roi">ROI</SelectItem>
                  <SelectItem value="impact">Impact</SelectItem>
                  <SelectItem value="cost">Lowest Cost</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Recommended Retention Actions ({sortedActions.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto max-h-[450px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="text-xs">Customer</TableHead>
                      <TableHead className="text-xs">Risk</TableHead>
                      <TableHead className="text-xs">Action</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs">Priority</TableHead>
                      <TableHead className="text-xs">Cost</TableHead>
                      <TableHead className="text-xs">Benefit</TableHead>
                      <TableHead className="text-xs">ROI</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedActions
                      .filter((r: any) => {
                        if (!searchTerm) return true;
                        const term = searchTerm.toLowerCase();
                        return (
                          (r.customerName || "").toLowerCase().includes(term) ||
                          (r.description || "").toLowerCase().includes(term) ||
                          (r.actionType || "").toLowerCase().includes(term)
                        );
                      })
                      .slice(0, 50)
                      .map((rec: any) => {
                        const statusCfg = STATUS_CONFIG[rec.status] || STATUS_CONFIG.pending;
                        const StatusIcon = statusCfg.icon;
                        return (
                          <TableRow key={rec.id} data-testid={`row-recommended-${rec.id}`}>
                            <TableCell className="text-xs">
                              <div>
                                <span className="font-medium">{rec.customerName}</span>
                                <span className="text-muted-foreground ml-1">#{rec.customerId}</span>
                              </div>
                              <span className="text-muted-foreground">{rec.customerRegion}</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <div
                                  className={`w-2 h-2 rounded-full ${
                                    (rec.riskScore || 0) > 0.7
                                      ? "bg-red-500"
                                      : (rec.riskScore || 0) > 0.4
                                        ? "bg-amber-500"
                                        : "bg-emerald-500"
                                  }`}
                                />
                                <span className="text-xs font-mono">
                                  {((rec.riskScore || 0) * 100).toFixed(0)}%
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-[10px]">
                                {rec.actionType}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs max-w-[180px] truncate">
                              {rec.description}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={PRIORITY_VARIANT[rec.priority] || "secondary"}
                                className="text-[10px]"
                              >
                                {rec.priority}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs font-mono">
                              ${(rec.estimatedCost || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-xs font-mono">
                              ${(rec.estimatedImpact || 0).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <span className="text-xs font-semibold">
                                {rec.roi || 0}x
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge className={statusCfg.color} variant="secondary">
                                <StatusIcon className="w-3 h-3 mr-1" />
                                {statusCfg.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {rec.status === "pending" && (
                                <Button
                                  size="sm"
                                  onClick={() => updateMutation.mutate({ id: rec.id, status: "in_progress" })}
                                  disabled={updateMutation.isPending}
                                  data-testid={`button-start-action-${rec.id}`}
                                >
                                  <Play className="w-3 h-3 mr-1" />
                                  Start
                                </Button>
                              )}
                              {rec.status === "in_progress" && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => updateMutation.mutate({ id: rec.id, status: "completed" })}
                                    disabled={updateMutation.isPending}
                                    data-testid={`button-complete-action-${rec.id}`}
                                  >
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Done
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { key: "pending", label: "Pending", count: pending.length, color: "text-amber-500" },
              { key: "in_progress", label: "In Progress", count: inProgress.length, color: "text-blue-500" },
              { key: "completed", label: "Completed", count: completed.length, color: "text-emerald-500" },
              { key: "declined", label: "Declined", count: declined.length, color: "text-red-500" },
            ].map((s) => (
              <Card
                key={s.key}
                className={`cursor-pointer ${queueFilter === s.key ? "ring-1 ring-primary" : ""}`}
                onClick={() => setQueueFilter(queueFilter === s.key ? "all" : s.key)}
                data-testid={`card-queue-${s.key}`}
              >
                <CardContent className="p-4 text-center">
                  <p className={`text-3xl font-bold ${s.color}`} data-testid={`text-queue-count-${s.key}`}>
                    {s.count}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">By Status</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={statusBreakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      innerRadius={35}
                      strokeWidth={2}
                    >
                      {statusBreakdown.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {statusBreakdown.map((s) => (
                    <div key={s.name} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.fill }} />
                        <span className="text-xs">{s.name}</span>
                      </div>
                      <span className="text-xs font-medium">{s.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">By Action Type</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={actionTypeBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="value" name="Count" radius={[3, 3, 0, 0]}>
                      {actionTypeBreakdown.map((_, i) => (
                        <Cell key={i} fill={ACTION_COLORS[i % ACTION_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold">
                Intervention Queue
                {queueFilter !== "all" && (
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    {STATUS_CONFIG[queueFilter]?.label || queueFilter}
                  </Badge>
                )}
              </CardTitle>
              <Input
                placeholder="Search queue..."
                className="w-48"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-queue"
              />
            </CardHeader>
            <CardContent>
              <div className="overflow-auto max-h-[400px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="text-xs">ID</TableHead>
                      <TableHead className="text-xs">Customer</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs">Priority</TableHead>
                      <TableHead className="text-xs">Revenue</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Outcome</TableHead>
                      <TableHead className="text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQueue.slice(0, 50).map((rec: any) => {
                      const statusCfg = STATUS_CONFIG[rec.status] || STATUS_CONFIG.pending;
                      const StatusIcon = statusCfg.icon;
                      return (
                        <TableRow key={rec.id} data-testid={`row-queue-${rec.id}`}>
                          <TableCell className="text-xs font-mono">#{rec.id}</TableCell>
                          <TableCell className="text-xs">
                            <div className="font-medium">{rec.customerName}</div>
                            <div className="text-muted-foreground">{rec.customerRegion}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px]">{rec.actionType}</Badge>
                          </TableCell>
                          <TableCell className="text-xs max-w-[180px] truncate">{rec.description}</TableCell>
                          <TableCell>
                            <Badge
                              variant={PRIORITY_VARIANT[rec.priority] || "secondary"}
                              className="text-[10px]"
                            >
                              {rec.priority}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            ${(rec.customerRevenue || 0).toFixed(0)}/mo
                          </TableCell>
                          <TableCell>
                            <Badge className={statusCfg.color} variant="secondary">
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {statusCfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{rec.outcome || "-"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {rec.status === "pending" && (
                                <Button
                                  size="sm"
                                  onClick={() => updateMutation.mutate({ id: rec.id, status: "in_progress" })}
                                  disabled={updateMutation.isPending}
                                  data-testid={`button-start-queue-${rec.id}`}
                                >
                                  <Play className="w-3 h-3 mr-1" />
                                  Start
                                </Button>
                              )}
                              {rec.status === "in_progress" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => updateMutation.mutate({ id: rec.id, status: "completed" })}
                                    disabled={updateMutation.isPending}
                                    data-testid={`button-complete-queue-${rec.id}`}
                                  >
                                    Complete
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => updateMutation.mutate({ id: rec.id, status: "declined" })}
                                    disabled={updateMutation.isPending}
                                    data-testid={`button-decline-queue-${rec.id}`}
                                  >
                                    Decline
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tracker" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <div className="p-2 rounded-md bg-primary/10">
                    <Activity className="w-4 h-4 text-primary" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Actions Triggered</p>
                <p className="text-3xl font-bold mt-1" data-testid="text-tracker-triggered">
                  {tracker.actionsTriggered || 0}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <div className="p-2 rounded-md bg-emerald-500/10">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Actions Executed</p>
                <p className="text-3xl font-bold mt-1" data-testid="text-tracker-executed">
                  {tracker.actionsExecuted || 0}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <div className="p-2 rounded-md bg-emerald-500/10">
                    <Shield className="w-4 h-4 text-emerald-500" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Save Success Rate</p>
                <p className="text-3xl font-bold mt-1" data-testid="text-tracker-success-rate">
                  {tracker.saveSuccessRate || 0}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <div className="p-2 rounded-md bg-primary/10">
                    <Clock className="w-4 h-4 text-primary" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg Resolution Time</p>
                <p className="text-3xl font-bold mt-1" data-testid="text-tracker-resolution">
                  {tracker.avgResolutionDays || 0} days
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <div className="p-2 rounded-md bg-amber-500/10">
                    <DollarSign className="w-4 h-4 text-amber-500" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Cost Spent</p>
                <p className="text-3xl font-bold mt-1" data-testid="text-tracker-cost">
                  ${((tracker.totalCostSpent || 0) / 1000).toFixed(0)}K
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <div className="p-2 rounded-md bg-emerald-500/10">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Revenue Impact</p>
                <p className="text-3xl font-bold mt-1 text-emerald-600 dark:text-emerald-400" data-testid="text-tracker-impact">
                  ${((tracker.totalImpactGenerated || 0) / 1000).toFixed(0)}K
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Execution Pipeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { label: "Pending Review", count: pending.length, total: allQueue.length, color: "bg-amber-500" },
                    { label: "In Progress", count: inProgress.length, total: allQueue.length, color: "bg-blue-500" },
                    { label: "Completed", count: completed.length, total: allQueue.length, color: "bg-emerald-500" },
                    { label: "Declined", count: declined.length, total: allQueue.length, color: "bg-red-500" },
                  ].map((stage) => (
                    <div key={stage.label} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">{stage.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {stage.count} ({stage.total > 0 ? ((stage.count / stage.total) * 100).toFixed(0) : 0}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${stage.color}`}
                          style={{ width: `${stage.total > 0 ? (stage.count / stage.total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">ROI by Action Type</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const roiAcc: Record<string, { cost: number; impact: number }> = {};
                  completed.forEach((r: any) => {
                    const t = r.actionType || "Other";
                    if (!roiAcc[t]) roiAcc[t] = { cost: 0, impact: 0 };
                    roiAcc[t].cost += r.estimatedCost || 0;
                    if (r.outcome === "saved") roiAcc[t].impact += r.estimatedImpact || 0;
                  });
                  const roiData = Object.entries(roiAcc).map(([name, d]) => ({
                    name,
                    roi: d.cost > 0 ? parseFloat((d.impact / d.cost).toFixed(1)) : 0,
                    cost: Math.round(d.cost),
                    impact: Math.round(d.impact),
                  }));

                  return (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={roiData}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          formatter={(value: any, name: string) =>
                            name === "ROI" ? `${value}x` : `$${Number(value).toLocaleString()}`
                          }
                        />
                        <Bar dataKey="roi" fill="hsl(150, 60%, 35%)" name="ROI" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  );
                })()}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Recently Completed Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto max-h-[300px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="text-xs">ID</TableHead>
                      <TableHead className="text-xs">Customer</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Cost</TableHead>
                      <TableHead className="text-xs">Impact</TableHead>
                      <TableHead className="text-xs">ROI</TableHead>
                      <TableHead className="text-xs">Outcome</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completed.slice(0, 20).map((rec: any) => (
                      <TableRow key={rec.id} data-testid={`row-completed-${rec.id}`}>
                        <TableCell className="text-xs font-mono">#{rec.id}</TableCell>
                        <TableCell className="text-xs">{rec.customerName}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]">{rec.actionType}</Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          ${(rec.estimatedCost || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          ${(rec.estimatedImpact || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs font-semibold">
                          {rec.roi || 0}x
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={rec.outcome === "saved" ? "secondary" : "secondary"}
                            className={`text-[10px] ${
                              rec.outcome === "saved"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : rec.outcome === "churned"
                                  ? "bg-red-500/10 text-red-600 dark:text-red-400"
                                  : ""
                            }`}
                          >
                            {rec.outcome || "N/A"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
