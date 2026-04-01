import { useState } from "react";
import { useLocation, Link } from "wouter";
import {
  LayoutDashboard, TrendingDown, Brain, Target, Upload, ClipboardCheck,
  BarChart3, GitBranch, Cpu, Rocket, ChevronDown, Activity, Search,
  AlertTriangle, Shield, Users, Zap, DollarSign, PieChart, ArrowRightLeft,
  Globe, Wifi, LineChart, Layers, Eye, Crosshair, BriefcaseBusiness,
  Database, FlaskConical, PackageCheck, MonitorDot, Bot, AreaChart,
  ScrollText, Workflow, FolderOpen, Microscope, HardDrive, CheckCircle2,
  Server, TrendingUp, Gavel, LayoutGrid, Home, ArrowLeft
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getIndustry, getUseCase } from "@/data/use-cases";

const churnDiagnosticsItems = [
  { title: "Pattern Explorer", url: "/churn-diagnostics/patterns", icon: LineChart },
  { title: "Segment Intelligence", url: "/churn-diagnostics/segments", icon: Layers },
  { title: "Driver Analysis", url: "/churn-diagnostics/drivers", icon: Activity },
  { title: "Financial Impact", url: "/churn-diagnostics/financial", icon: DollarSign },
];

const riskIntelligenceItems = [
  { title: "Risk Overview", url: "/risk-intelligence/overview", icon: Shield },
  { title: "Customer Risk Explorer", url: "/risk-intelligence/explorer", icon: Search },
  { title: "Early Warning Signals", url: "/risk-intelligence/warnings", icon: AlertTriangle },
];

const retentionItems = [
  { title: "Recommended Actions", url: "/retention/actions", icon: Target },
  { title: "Intervention Queue", url: "/retention/queue", icon: Zap },
  { title: "Execution Tracker", url: "/retention/tracker", icon: Eye },
];

const businessImpactItems = [
  { title: "Revenue Protection", url: "/business-impact/revenue", icon: DollarSign },
  { title: "ROI Analysis", url: "/business-impact/roi", icon: PieChart },
  { title: "Migration Economics", url: "/business-impact/migration", icon: ArrowRightLeft },
];

const strategyItems = [
  { title: "Competitive Landscape", url: "/strategy/competitive", icon: Globe },
  { title: "Network Health Impact", url: "/strategy/network", icon: Wifi },
  { title: "Migration Intelligence", url: "/strategy/migration", icon: ArrowRightLeft },
];

const orionItems = [
  { title: "ML Overview", url: "/orion/overview", icon: BriefcaseBusiness },
  { title: "Data Hub", url: "/orion/data", icon: Database },
  { title: "Experiment Lab", url: "/orion/experiments", icon: FlaskConical },
  { title: "Deployment & Scoring", url: "/orion/deploy", icon: Rocket },
  { title: "Outcomes & Recommendations", url: "/orion/outcomes", icon: TrendingUp },
  { title: "Governance & Audit", url: "/orion/governance", icon: Gavel },
];

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

function NavGroup({ label, items, location, defaultOpen = true }: {
  label: string; items: NavItem[]; location: string; defaultOpen?: boolean;
}) {
  const isActive = items.some((item) => location === item.url || location.startsWith(item.url + "/"));
  return (
    <Collapsible defaultOpen={defaultOpen || isActive}>
      <SidebarGroup>
        <CollapsibleTrigger className="flex items-center justify-between gap-1 w-full">
          <SidebarGroupLabel className="flex-1 text-left">{label}</SidebarGroupLabel>
          <ChevronDown className="w-3 h-3 text-muted-foreground mr-2" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild data-active={location === item.url}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                    <Link href={item.url}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

const SECTION_ICONS = [LineChart, Layers, Shield, DollarSign];

function DemoNav({ industryId, useCaseId, location }: { industryId: string; useCaseId: string; location: string }) {
  const useCase = getUseCase(industryId, useCaseId);
  const industry = getIndustry(industryId);
  if (!useCase || !industry) return null;

  const overviewUrl = `/demo/${industryId}/${useCaseId}`;
  const sectionUrls = [
    `/demo/${industryId}/${useCaseId}/analytics`,
    `/demo/${industryId}/${useCaseId}/risk`,
    `/demo/${industryId}/${useCaseId}/actions`,
    `/demo/${industryId}/${useCaseId}/impact`,
  ];

  const [analyticsOpen, setAnalyticsOpen] = useState(true);

  return (
    <>
      {/* Back to platform */}
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild data-testid="nav-platform-home">
                <Link href="/home"><Home className="w-4 h-4" /><span>Platform Home</span></Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild data-active={location === overviewUrl} data-testid="nav-demo-overview">
                <Link href={overviewUrl}>
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Command Center</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Business Analytics — demo sections */}
      <div className="px-2 pt-1">
        <button
          onClick={() => setAnalyticsOpen(o => !o)}
          data-testid="toggle-demo-analytics"
          className="flex items-center justify-between w-full px-2 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Business Analytics</span>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${analyticsOpen ? "" : "-rotate-90"}`} />
        </button>
      </div>

      {analyticsOpen && (
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {useCase.businessTabs.slice(0, 4).map((tab, i) => {
                const Icon = SECTION_ICONS[i] ?? Activity;
                const url = sectionUrls[i];
                return (
                  <SidebarMenuItem key={tab.label}>
                    <SidebarMenuButton asChild data-active={location === url}
                      data-testid={`nav-demo-${tab.label.toLowerCase().replace(/\s+/g, '-')}`}>
                      <Link href={url}>
                        <Icon className="w-4 h-4" />
                        <span>{tab.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}
    </>
  );
}

const businessUrls = [
  ...churnDiagnosticsItems, ...riskIntelligenceItems, ...retentionItems,
  ...businessImpactItems, ...strategyItems,
].map(i => i.url);

export function AppSidebar() {
  const [location] = useLocation();

  // Detect demo pages
  const demoMatch = location.match(/^\/demo\/([^/]+)\/([^/]+)/);
  const isDemoPage = !!demoMatch;
  const demoIndustryId = demoMatch?.[1] ?? "";
  const demoUseCaseId = demoMatch?.[2] ?? "";

  const isBusinessActive = businessUrls.some(u => location === u || location.startsWith(u + "/"));
  const [businessOpen, setBusinessOpen] = useState(isBusinessActive || location === "/");

  const demoUseCase = isDemoPage ? getUseCase(demoIndustryId, demoUseCaseId) : null;

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: "#FFD822" }}>
            <Zap className="w-4 h-4 text-black" />
          </div>
          <div>
            <h2 className="text-sm font-bold leading-tight tracking-wide">ML Orion</h2>
            {isDemoPage && demoUseCase ? (
              <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{demoUseCase.shortName}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Decision Intelligence</p>
            )}
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {isDemoPage ? (
          /* ── DEMO USE CASE NAV ── */
          <DemoNav industryId={demoIndustryId} useCaseId={demoUseCaseId} location={location} />
        ) : (
          /* ── CUSTOMER CHURN NAV ── */
          <>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location === "/home"} data-testid="nav-platform-home">
                      <Link href="/home"><LayoutGrid className="w-4 h-4" /><span>Platform Home</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location === "/"} data-testid="nav-command-center">
                      <Link href="/"><LayoutDashboard className="w-4 h-4" /><span>Command Center</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <div className="px-2 pt-1">
              <button
                onClick={() => setBusinessOpen(o => !o)}
                data-testid="toggle-business-section"
                className="flex items-center justify-between w-full px-2 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Business Analytics</span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${businessOpen ? "" : "-rotate-90"}`} />
              </button>
            </div>

            {businessOpen && (
              <>
                <NavGroup label="Churn Diagnostics" items={churnDiagnosticsItems} location={location} defaultOpen={false} />
                <NavGroup label="Customer Risk Intelligence" items={riskIntelligenceItems} location={location} defaultOpen={false} />
                <NavGroup label="Retention Action Center" items={retentionItems} location={location} defaultOpen={false} />
                <NavGroup label="Business Impact" items={businessImpactItems} location={location} defaultOpen={false} />
                <NavGroup label="Strategy Insights" items={strategyItems} location={location} defaultOpen={false} />
              </>
            )}
          </>
        )}

        {/* ── ML ORION — always visible ── */}
        {(() => {
          const orionBase = isDemoPage
            ? `/demo/${demoIndustryId}/${demoUseCaseId}/orion`
            : `/orion`;
          const resolvedOrionItems = orionItems.map(item => ({
            ...item,
            url: `${orionBase}/${item.url.replace("/orion/", "")}`,
          }));
          const isOrionActive = location.startsWith("/orion/") || location.includes("/orion/");
          return (
            <Collapsible defaultOpen={isOrionActive}>
              <SidebarGroup>
                <CollapsibleTrigger className="flex items-center justify-between gap-1 w-full">
                  <SidebarGroupLabel className="flex-1 text-left">ML Orion</SidebarGroupLabel>
                  <ChevronDown className="w-3 h-3 text-muted-foreground mr-2" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {resolvedOrionItems.map((item, idx) => (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton asChild data-active={location === item.url}
                            data-testid={`nav-orion-${item.title.toLowerCase().replace(/[\s&]+/g, '-')}`}>
                            <Link href={item.url}>
                              <item.icon className="w-4 h-4" />
                              <span>{item.title}</span>
                              <span className="ml-auto text-[9px] text-muted-foreground font-mono">{String(idx + 1).padStart(2, '0')}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          );
        })()}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="text-[10px] text-muted-foreground text-center">
          ML Orion v2.0 — Decision Intelligence Platform
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
