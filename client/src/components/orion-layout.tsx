import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, RefreshCw } from "lucide-react";
import { useState } from "react";

interface OrionLayoutProps {
  title: string;
  subtitle?: string;
  isLoading?: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function OrionLayout({ title, subtitle, isLoading, children, actions }: OrionLayoutProps) {
  const [period, setPeriod] = useState("q1-2026");

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b bg-card px-6 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
                <Brain className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">ML Orion</span>
                  <span className="text-[10px] text-muted-foreground">/</span>
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Decision Model Factory</span>
                </div>
                <h1 className="text-sm font-semibold leading-tight">{title}</h1>
              </div>
            </div>
            {subtitle && (
              <span className="hidden md:block text-xs text-muted-foreground border-l pl-3">{subtitle}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-7 text-xs w-28" data-testid="select-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="q1-2026">Q1 2026</SelectItem>
                <SelectItem value="q4-2025">Q4 2025</SelectItem>
                <SelectItem value="ytd">YTD 2026</SelectItem>
                <SelectItem value="rolling-90">Rolling 90d</SelectItem>
              </SelectContent>
            </Select>
            {actions}
            <Button variant="ghost" size="icon" className="h-7 w-7" data-testid="button-refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        {isLoading && (
          <div className="mt-2 h-0.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary animate-pulse w-1/2 rounded-full" />
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto p-6">
        {children}
      </div>
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: "default" | "green" | "amber" | "red" | "blue";
  trend?: "up" | "down";
  testId?: string;
}

export function KpiCard({ label, value, sub, color = "default", trend, testId }: KpiCardProps) {
  const accent = {
    default: "text-foreground",
    green: "text-emerald-500",
    amber: "text-amber-500",
    red: "text-red-500",
    blue: "text-blue-500",
  }[color];

  return (
    <div className="bg-card border rounded-lg p-4" data-testid={testId ?? `kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${accent}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      {trend && (
        <p className={`text-[10px] mt-0.5 ${trend === "up" ? "text-emerald-500" : "text-red-500"}`}>
          {trend === "up" ? "↑" : "↓"}
        </p>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Production: "bg-emerald-500/15 text-emerald-600 border-emerald-200",
    Pilot: "bg-blue-500/15 text-blue-600 border-blue-200",
    Training: "bg-amber-500/15 text-amber-600 border-amber-200",
    Validation: "bg-purple-500/15 text-purple-600 border-purple-200",
    Archived: "bg-gray-500/15 text-gray-500 border-gray-200",
    Draft: "bg-gray-500/10 text-gray-400 border-gray-200",
    Active: "bg-emerald-500/15 text-emerald-600 border-emerald-200",
    Processed: "bg-emerald-500/15 text-emerald-600 border-emerald-200",
    Error: "bg-red-500/15 text-red-600 border-red-200",
    Connected: "bg-emerald-500/15 text-emerald-600 border-emerald-200",
    Stale: "bg-amber-500/15 text-amber-600 border-amber-200",
    Pass: "bg-emerald-500/15 text-emerald-600 border-emerald-200",
    Warning: "bg-amber-500/15 text-amber-600 border-amber-200",
    Fail: "bg-red-500/15 text-red-600 border-red-200",
    Alert: "bg-red-500/15 text-red-600 border-red-200",
    Stable: "bg-emerald-500/15 text-emerald-600 border-emerald-200",
    Drifting: "bg-amber-500/15 text-amber-600 border-amber-200",
    Running: "bg-emerald-500/15 text-emerald-600 border-emerald-200",
    Standby: "bg-blue-500/15 text-blue-600 border-blue-200",
    Shortlisted: "bg-emerald-500/15 text-emerald-600 border-emerald-200",
    Compared: "bg-blue-500/15 text-blue-600 border-blue-200",
    Baseline: "bg-gray-500/15 text-gray-500 border-gray-200",
    Rejected: "bg-red-500/15 text-red-600 border-red-200",
    Approved: "bg-emerald-500/15 text-emerald-600 border-emerald-200",
    Pending: "bg-amber-500/15 text-amber-600 border-amber-200",
    Overdue: "bg-red-500/15 text-red-600 border-red-200",
    Live: "bg-emerald-500/15 text-emerald-600 border-emerald-200",
    "Data Ready": "bg-blue-500/15 text-blue-600 border-blue-200",
    Validated: "bg-purple-500/15 text-purple-600 border-purple-200",
    "In Progress": "bg-blue-500/15 text-blue-600 border-blue-200",
    trained: "bg-blue-500/15 text-blue-600 border-blue-200",
    deployed: "bg-emerald-500/15 text-emerald-600 border-emerald-200",
    healthy: "bg-emerald-500/15 text-emerald-600 border-emerald-200",
    "at risk": "bg-amber-500/15 text-amber-600 border-amber-200",
    stale: "bg-gray-500/15 text-gray-500 border-gray-200",
    drifting: "bg-amber-500/15 text-amber-600 border-amber-200",
  };
  const cls = map[status] ?? "bg-gray-500/10 text-gray-500 border-gray-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${cls}`}>
      {status}
    </span>
  );
}

export function OrionNav({ current }: { current: string }) {
  const pages = [
    { label: "Overview", path: "/orion/overview" },
    { label: "Data Hub", path: "/orion/data" },
    { label: "Experiments", path: "/orion/experiments" },
    { label: "Deploy & Score", path: "/orion/deploy" },
    { label: "Outcomes", path: "/orion/outcomes" },
    { label: "Governance", path: "/orion/governance" },
  ];
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
      {pages.map((p, i) => (
        <span key={p.path} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground/40">›</span>}
          <a
            href={p.path}
            className={`hover:text-foreground transition-colors px-1.5 py-0.5 rounded ${
              current === p.path ? "text-primary font-medium bg-primary/5" : ""
            }`}
          >
            {p.label}
          </a>
        </span>
      ))}
    </div>
  );
}
