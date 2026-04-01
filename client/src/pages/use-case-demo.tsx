import { useParams, useLocation } from "wouter";
import { getIndustry, getUseCase, TabDef } from "@/data/use-cases";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, Activity, AlertTriangle, Info,
  ArrowLeft, ChevronRight, Lightbulb, Target, Zap,
  ShieldAlert, CheckCircle2, Clock, DollarSign, Users,
  ArrowUpRight, BarChart3, Cpu,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation as useWouterLocation, Link } from "wouter";

const INDUSTRY_META: Record<string, { color: string; label: string }> = {
  cpg: { color: "#22c55e", label: "Consumer Packaged Goods" },
  retail: { color: "#3b82f6", label: "Retail & E-commerce" },
  tmt: { color: "#FFD822", label: "Telecom, Media & Technology" },
  bfsi: { color: "#a855f7", label: "Banking, Financial Services & Insurance" },
};

const KPI_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  green: { bg: "bg-green-500/8", text: "text-green-400", border: "border-green-500/20" },
  red: { bg: "bg-red-500/8", text: "text-red-400", border: "border-red-500/20" },
  amber: { bg: "bg-amber-500/8", text: "text-amber-400", border: "border-amber-500/20" },
  blue: { bg: "bg-blue-500/8", text: "text-blue-400", border: "border-blue-500/20" },
};

const CHART_COLORS = ["#FFD822", "#22c55e", "#3b82f6", "#a855f7", "#f97316", "#06b6d4"];

function DemoChart({ tab, height = 260 }: { tab: TabDef; height?: number }) {
  const data = tab.chartData;
  const keys = data.length > 0 ? Object.keys(data[0]).filter(k => k !== "name") : [];

  const tooltipStyle = { background: "#1c1c1e", border: "1px solid #ffffff18", borderRadius: 6, fontSize: 11 };
  const tickStyle = { fontSize: 10, fill: "#ffffff55" };

  if (tab.chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
          <XAxis dataKey="name" tick={tickStyle} />
          <YAxis tick={tickStyle} />
          <Tooltip contentStyle={tooltipStyle} />
          {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
          {keys.map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} stroke={CHART_COLORS[i]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (tab.chartType === "area") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
          <defs>
            {keys.map((k, i) => (
              <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS[i]} stopOpacity={0.25} />
                <stop offset="95%" stopColor={CHART_COLORS[i]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
          <XAxis dataKey="name" tick={tickStyle} />
          <YAxis tick={tickStyle} />
          <Tooltip contentStyle={tooltipStyle} />
          {keys.map((k, i) => (
            <Area key={k} type="monotone" dataKey={k} stroke={CHART_COLORS[i]} fill={`url(#grad-${k})`} strokeWidth={2} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
        <XAxis dataKey="name" tick={tickStyle} />
        <YAxis tick={tickStyle} />
        <Tooltip contentStyle={tooltipStyle} />
        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
        {keys.map((k, i) => (
          <Bar key={k} dataKey={k} fill={CHART_COLORS[i]} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function InsightPanel({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="space-y-3">
      {rows.map(row => (
        <div key={row.label} className="border-b border-border/40 pb-2.5 last:border-0 last:pb-0">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{row.label}</div>
          <div className="text-xs font-semibold">{row.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ── OVERVIEW (Command Center) ── */
function OverviewSection({ useCase, industry, industryColor }: any) {
  const tab0 = useCase.businessTabs[0];
  const tab1 = useCase.businessTabs[1];

  const alerts = [
    { severity: "high", text: `${tab0?.insightRows[0]?.label ?? "Top metric"}: ${tab0?.insightRows[0]?.value ?? "—"}` },
    { severity: "medium", text: `${tab1?.insightRows[0]?.label ?? "Second signal"}: ${tab1?.insightRows[0]?.value ?? "—"}` },
    { severity: "low", text: `${tab0?.insightRows[2]?.label ?? "Third indicator"}: ${tab0?.insightRows[2]?.value ?? "—"}` },
  ];

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="kpi-row">
        {useCase.kpis.map((kpi: any) => {
          const s = KPI_STYLES[kpi.color] ?? KPI_STYLES.blue;
          return (
            <div key={kpi.label} className={`rounded-xl border p-4 ${s.bg} ${s.border}`} data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s+/g, "-")}`}>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{kpi.label}</div>
              <div className={`text-2xl font-bold ${s.text}`}>{kpi.value}</div>
              <div className="flex items-center gap-1 mt-1">
                {kpi.up ? <TrendingUp className="w-3 h-3 text-green-400" /> : <TrendingDown className="w-3 h-3 text-red-400" />}
                <span className="text-[10px] text-muted-foreground">{kpi.trend}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
        {/* Primary trend chart */}
        <Card className="lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              {tab0?.label ?? "Trend Analysis"}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">{tab0?.description}</p>
          </CardHeader>
          <CardContent>
            {tab0 && <DemoChart tab={tab0} height={240} />}
          </CardContent>
        </Card>

        {/* Insights panel */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-[#FFD822]" />
              Key Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InsightPanel rows={tab0?.insightRows ?? []} />
          </CardContent>
        </Card>
      </div>

      {/* Secondary row */}
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
        {/* Risk alerts */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Active Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((alert, i) => (
              <div key={i} className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${
                alert.severity === "high" ? "bg-red-500/8 border-red-500/20" :
                alert.severity === "medium" ? "bg-amber-500/8 border-amber-500/20" :
                "bg-blue-500/8 border-blue-500/20"
              }`}>
                <ShieldAlert className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                  alert.severity === "high" ? "text-red-400" :
                  alert.severity === "medium" ? "text-amber-400" : "text-blue-400"
                }`} />
                <span className="text-[11px] leading-relaxed">{alert.text}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Second chart */}
        <Card className="lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              {tab1?.label ?? "Performance Breakdown"}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">{tab1?.description}</p>
          </CardHeader>
          <CardContent>
            {tab1 && <DemoChart tab={tab1} height={200} />}
          </CardContent>
        </Card>
      </div>

      {/* Quick metrics strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {useCase.kpis.map((kpi: any, i: number) => (
          <div key={kpi.label} className="rounded-lg border border-border/50 bg-muted/20 p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: industryColor + "22" }}>
              {i === 0 ? <Target className="w-4 h-4" style={{ color: industryColor }} /> :
               i === 1 ? <Users className="w-4 h-4" style={{ color: industryColor }} /> :
               i === 2 ? <DollarSign className="w-4 h-4" style={{ color: industryColor }} /> :
               <Zap className="w-4 h-4" style={{ color: industryColor }} />}
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">{kpi.label}</div>
              <div className="text-sm font-bold">{kpi.value}</div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

/* ── ANALYTICS SECTION (deep dive) ── */
function AnalyticsSection({ tab, useCase, industryColor }: { tab: TabDef | undefined; useCase: any; industryColor: string }) {
  if (!tab) return <div className="p-8 text-center text-muted-foreground text-sm">No data for this section.</div>;

  const tab3 = useCase.businessTabs[3];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
        <Card className="lg:col-span-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              {tab.label}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">{tab.description}</p>
          </CardHeader>
          <CardContent>
            <DemoChart tab={tab} height={280} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-[#FFD822]" />
              Findings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InsightPanel rows={tab.insightRows} />
          </CardContent>
        </Card>
      </div>

      {/* Additional context */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#FFD822]" />
            AI Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {tab.insightRows.map((row, i) => (
              <div key={row.label} className="rounded-lg border border-border/50 p-3">
                <div className={`w-6 h-6 rounded-md flex items-center justify-center mb-2 ${
                  i === 0 ? "bg-green-500/15" : i === 1 ? "bg-amber-500/15" : i === 2 ? "bg-blue-500/15" : "bg-purple-500/15"
                }`}>
                  {i === 0 ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> :
                   i === 1 ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> :
                   i === 2 ? <Target className="w-3.5 h-3.5 text-blue-400" /> :
                   <ArrowUpRight className="w-3.5 h-3.5 text-purple-400" />}
                </div>
                <div className="text-[10px] text-muted-foreground mb-0.5">{row.label}</div>
                <div className="text-xs font-medium">{row.value}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── RISK SECTION ── */
function RiskSection({ tab, useCase, industryColor }: { tab: TabDef | undefined; useCase: any; industryColor: string }) {
  if (!tab) return <div className="p-8 text-center text-muted-foreground text-sm">No data for this section.</div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              {tab.label}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">{tab.description}</p>
          </CardHeader>
          <CardContent>
            <DemoChart tab={tab} height={260} />
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Risk Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {tab.insightRows.slice(0, 2).map(r => (
                <div key={r.label} className="flex items-start justify-between gap-2 py-1.5 border-b border-border/40 last:border-0">
                  <span className="text-[10px] text-muted-foreground">{r.label}</span>
                  <span className="text-xs font-semibold text-right max-w-[55%]">{r.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                Actions Required
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {tab.insightRows.slice(2).map(r => (
                <div key={r.label} className="rounded-md bg-amber-500/8 border border-amber-500/20 p-2">
                  <div className="text-[9px] text-amber-400/70 uppercase tracking-wide">{r.label}</div>
                  <div className="text-[11px] font-medium mt-0.5">{r.value}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Risk score distribution */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "High Risk", value: useCase.kpis[2]?.value ?? "—", color: "red", icon: AlertTriangle },
          { label: "Medium Risk", value: useCase.kpis[1]?.value ?? "—", color: "amber", icon: Clock },
          { label: "Low Risk", value: useCase.kpis[0]?.value ?? "—", color: "green", icon: CheckCircle2 },
        ].map(item => {
          const s = KPI_STYLES[item.color as any] ?? KPI_STYLES.blue;
          return (
            <div key={item.label} className={`rounded-xl border p-4 ${s.bg} ${s.border}`}>
              <div className="flex items-center gap-2 mb-2">
                <item.icon className={`w-4 h-4 ${s.text}`} />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</span>
              </div>
              <div className={`text-2xl font-bold ${s.text}`}>{item.value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── ACTIONS SECTION ── */
function ActionsSection({ tab, useCase, industryColor }: { tab: TabDef | undefined; useCase: any; industryColor: string }) {
  if (!tab) return <div className="p-8 text-center text-muted-foreground text-sm">No data for this section.</div>;

  const queue = tab.insightRows.map((r, i) => ({
    id: i + 1,
    action: r.label,
    detail: r.value,
    priority: i === 0 ? "High" : i === 1 ? "Medium" : "Low",
    status: i === 0 ? "In Progress" : i === 1 ? "Queued" : "Planned",
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
        <Card className="lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Target className="w-4 h-4 text-muted-foreground" />
              {tab.label}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">{tab.description}</p>
          </CardHeader>
          <CardContent>
            <DemoChart tab={tab} height={240} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#FFD822]" />
              Action Queue
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {queue.map(item => (
              <div key={item.id} className="flex items-start justify-between gap-2 rounded-lg border border-border/40 p-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      item.priority === "High" ? "bg-red-500/15 text-red-400" :
                      item.priority === "Medium" ? "bg-amber-500/15 text-amber-400" :
                      "bg-blue-500/15 text-blue-400"
                    }`}>{item.priority}</span>
                    <span className="text-[10px] text-muted-foreground">{item.status}</span>
                  </div>
                  <div className="text-[11px] font-medium truncate">{item.action}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{item.detail}</div>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Recommended Actions", value: String(queue.length), icon: Target, color: "blue" },
          { label: "High Priority", value: String(queue.filter(q => q.priority === "High").length), icon: AlertTriangle, color: "red" },
          { label: "In Progress", value: String(queue.filter(q => q.status === "In Progress").length), icon: Activity, color: "green" },
          { label: "Est. Impact", value: useCase.kpis[0]?.value ?? "—", icon: TrendingUp, color: "amber" },
        ].map(s => {
          const st = KPI_STYLES[s.color as any] ?? KPI_STYLES.blue;
          return (
            <div key={s.label} className={`rounded-xl border p-4 ${st.bg} ${st.border}`}>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{s.label}</div>
              <div className={`text-xl font-bold ${st.text}`}>{s.value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── IMPACT SECTION ── */
function ImpactSection({ tab, useCase, industryColor }: { tab: TabDef | undefined; useCase: any; industryColor: string }) {
  if (!tab) return <div className="p-8 text-center text-muted-foreground text-sm">No data for this section.</div>;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {useCase.kpis.map((kpi: any, i: number) => {
          const s = KPI_STYLES[kpi.color] ?? KPI_STYLES.blue;
          return (
            <div key={kpi.label} className={`rounded-xl border p-4 ${s.bg} ${s.border}`}>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{kpi.label}</div>
              <div className={`text-xl font-bold ${s.text}`}>{kpi.value}</div>
              <div className="flex items-center gap-1 mt-1">
                {kpi.up ? <TrendingUp className="w-3 h-3 text-green-400" /> : <TrendingDown className="w-3 h-3 text-red-400" />}
                <span className="text-[10px] text-muted-foreground">{kpi.trend}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
        <Card className="lg:col-span-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              {tab.label}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">{tab.description}</p>
          </CardHeader>
          <CardContent>
            <DemoChart tab={tab} height={260} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-[#FFD822]" />
              Business Impact
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InsightPanel rows={tab.insightRows} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ── ML ORION PANEL (always shown at bottom of analytics sections) ── */
const ORION_QUICK_LINKS = [
  { label: "ML Overview", page: "overview" },
  { label: "Data Hub", page: "data" },
  { label: "Experiments", page: "experiments" },
  { label: "Deploy", page: "deploy" },
  { label: "Outcomes", page: "outcomes" },
  { label: "Governance", page: "governance" },
];

function OrionPanel({ useCase, industryId, useCaseId }: { useCase: any; industryId: string; useCaseId: string }) {
  const [, navigate] = useWouterLocation();
  const orionBase = `/demo/${industryId}/${useCaseId}/orion`;
  return (
    <Card className="border border-yellow-500/20 bg-yellow-500/3">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#FFD822]" />
          ML Orion — Model Context
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Target Variable</div>
            <div className="font-mono text-xs rounded px-2 py-1 bg-black/30 inline-block" style={{ color: "#FFD822" }}>
              {useCase.orionContext.targetVariable}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 mt-3">Algorithms</div>
            <div className="flex flex-wrap gap-1">
              {useCase.orionContext.algorithms.map((a: string) => (
                <span key={a} className="text-[9px] px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-white/60">{a}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Key Features</div>
            <div className="flex flex-wrap gap-1">
              {useCase.orionContext.features.map((f: string) => (
                <span key={f} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">{f}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">EDA Highlights</div>
            <ul className="space-y-1.5">
              {useCase.orionContext.edaHighlights.map((h: string) => (
                <li key={h} className="text-[10px] text-muted-foreground flex gap-1.5">
                  <span style={{ color: "#FFD822" }} className="mt-0.5 flex-shrink-0">·</span>{h}
                </li>
              ))}
            </ul>
          </div>
        </div>
        {/* Quick links to demo orion pages */}
        <div className="mt-4 pt-3 border-t border-yellow-500/15">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Explore in ML Orion</div>
          <div className="flex flex-wrap gap-1.5">
            {ORION_QUICK_LINKS.map(link => (
              <button
                key={link.page}
                onClick={() => navigate(`${orionBase}/${link.page}`)}
                className="text-[9px] px-2 py-1 rounded border border-yellow-500/30 bg-yellow-500/8 text-yellow-400 hover:bg-yellow-500/15 transition-colors"
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── MAIN COMPONENT ── */
export default function UseCaseDemo() {
  const { industry: industryId, useCase: useCaseId, section = "overview" } = useParams<{
    industry: string; useCase: string; section?: string;
  }>();
  const [, navigate] = useLocation();

  const industry = getIndustry(industryId ?? "");
  const useCase = getUseCase(industryId ?? "", useCaseId ?? "");
  const meta = INDUSTRY_META[industryId ?? ""] ?? { color: "#FFD822", label: "" };

  if (!industry || !useCase) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Info className="w-8 h-8" />
        <p className="text-sm">Use case not found.</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/home")}>Back to Platform</Button>
      </div>
    );
  }

  const baseUrl = `/demo/${industryId}/${useCaseId}`;
  const tabs = useCase.businessTabs;

  const sectionConfig: { key: string; label: string; tab: TabDef | undefined }[] = [
    { key: "analytics", label: tabs[0]?.label ?? "Analytics", tab: tabs[0] },
    { key: "risk", label: tabs[1]?.label ?? "Risk", tab: tabs[1] },
    { key: "actions", label: tabs[2]?.label ?? "Actions", tab: tabs[2] },
    { key: "impact", label: tabs[3]?.label ?? "Impact", tab: tabs[3] },
  ];

  const currentSectionLabel = section === "overview"
    ? "Command Center"
    : sectionConfig.find(s => s.key === section)?.label ?? section;

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto" data-testid="use-case-demo-page">
      {/* ── HEADER ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <button onClick={() => navigate("/home")} className="hover:text-foreground flex items-center gap-1 transition-colors">
              <ArrowLeft className="w-3 h-3" /> ML Orion Platform
            </button>
            <ChevronRight className="w-3 h-3" />
            <span style={{ color: meta.color }}>{industry.name}</span>
            <ChevronRight className="w-3 h-3" />
            <span>{useCase.name}</span>
            {section !== "overview" && (
              <>
                <ChevronRight className="w-3 h-3" />
                <span>{currentSectionLabel}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">{useCase.name}</h1>
            <Badge variant="outline" className="text-[9px] uppercase tracking-wider" style={{ borderColor: meta.color + "40", color: meta.color }}>
              {industry.name}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">{useCase.description}</p>
        </div>
        <div className="hidden lg:block flex-shrink-0">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider text-right">{currentSectionLabel}</div>
          <div className="text-xs font-semibold mt-0.5 text-right" style={{ color: meta.color }}>{industry.fullName}</div>
        </div>
      </div>

      {/* ── RENDER SECTION ── */}
      {section === "overview" && (
        <OverviewSection useCase={useCase} industry={industry} industryColor={meta.color} />
      )}
      {section === "analytics" && (
        <>
          <AnalyticsSection tab={sectionConfig[0].tab} useCase={useCase} industryColor={meta.color} />
          <OrionPanel useCase={useCase} industryId={industryId ?? ""} useCaseId={useCaseId ?? ""} />
        </>
      )}
      {section === "risk" && (
        <>
          <RiskSection tab={sectionConfig[1].tab} useCase={useCase} industryColor={meta.color} />
          <OrionPanel useCase={useCase} industryId={industryId ?? ""} useCaseId={useCaseId ?? ""} />
        </>
      )}
      {section === "actions" && (
        <>
          <ActionsSection tab={sectionConfig[2].tab} useCase={useCase} industryColor={meta.color} />
          <OrionPanel useCase={useCase} industryId={industryId ?? ""} useCaseId={useCaseId ?? ""} />
        </>
      )}
      {section === "impact" && (
        <>
          <ImpactSection tab={sectionConfig[3].tab} useCase={useCase} industryColor={meta.color} />
          <OrionPanel useCase={useCase} industryId={industryId ?? ""} useCaseId={useCaseId ?? ""} />
        </>
      )}
    </div>
  );
}
