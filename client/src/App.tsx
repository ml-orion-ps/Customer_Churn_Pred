import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import ChurnDiagnostics from "@/pages/churn-diagnostics";
import RiskIntelligence from "@/pages/risk-intelligence";
import RetentionCenter from "@/pages/retention-center";
import BusinessImpact from "@/pages/business-impact";
import StrategyInsights from "@/pages/strategy-insights";
import OrionOverview from "@/pages/orion-overview";
import OrionData from "@/pages/orion-data";
import OrionExperiments from "@/pages/orion-experiments";
import OrionDeploy from "@/pages/orion-deploy";
import OrionOutcomes from "@/pages/orion-outcomes";
import OrionGovernance from "@/pages/orion-governance";
import LandingPage from "@/pages/landing";
import UseCaseDemo from "@/pages/use-case-demo";
import DemoOrionPage from "@/pages/demo-orion";

function SidebarRouter() {
  return (
    <Switch>
      <Route path="/demo/:industry/:useCase/orion/:page" component={DemoOrionPage} />
      <Route path="/demo/:industry/:useCase/:section" component={UseCaseDemo} />
      <Route path="/demo/:industry/:useCase" component={UseCaseDemo} />
      <Route path="/" component={Dashboard} />
      <Route path="/churn-diagnostics/:tab?" component={ChurnDiagnostics} />
      <Route path="/risk-intelligence/:tab?" component={RiskIntelligence} />
      <Route path="/retention/:tab?" component={RetentionCenter} />
      <Route path="/business-impact/:tab?" component={BusinessImpact} />
      <Route path="/strategy/:tab?" component={StrategyInsights} />
      <Route path="/orion/overview" component={OrionOverview} />
      <Route path="/orion/data" component={OrionData} />
      <Route path="/orion/experiments" component={OrionExperiments} />
      <Route path="/orion/deploy" component={OrionDeploy} />
      <Route path="/orion/outcomes" component={OrionOutcomes} />
      <Route path="/orion/governance" component={OrionGovernance} />
      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = { "--sidebar-width": "17rem", "--sidebar-width-icon": "3rem" };

function HeaderLabel() {
  const [location] = useLocation();
  if (location.startsWith("/demo/")) return <span className="text-xs text-muted-foreground">ML Orion — Use Case Intelligence</span>;
  if (location.startsWith("/orion/")) return <span className="text-xs text-muted-foreground">ML Orion — ML Factory</span>;
  return <span className="text-xs text-muted-foreground">ML Orion — Customer Churn Intelligence</span>;
}

function AppContent() {
  const [location] = useLocation();

  /* ── Landing page: no sidebar, full screen ── */
  if (location === "/home") {
    return (
      <div className="h-screen w-full overflow-auto">
        <LandingPage />
      </div>
    );
  }

  /* ── All other routes: sidebar layout ── */
  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-2 p-2 border-b shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <HeaderLabel />
          </header>
          <main className="flex-1 overflow-auto">
            <SidebarRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
