import { useState } from "react";
import { useLocation } from "wouter";
import { INDUSTRIES } from "@/data/use-cases";
import {
  ShoppingCart, Store, Wifi, Building2, ChevronRight,
  Zap, BarChart3, TrendingUp, ArrowRight, Globe,
} from "lucide-react";

const INDUSTRY_ICONS: Record<string, any> = {
  cpg: ShoppingCart,
  retail: Store,
  tmt: Wifi,
  bfsi: Building2,
};

const TAG_COLORS: Record<string, string> = {
  RGM: "bg-green-500/15 text-green-400 border-green-500/30",
  Operations: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Distribution: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  Marketing: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  Retention: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Inventory: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  Revenue: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Analytics: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  Risk: "bg-red-500/15 text-red-400 border-red-500/30",
  Insurance: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
};

const INDUSTRY_GRADIENT: Record<string, string> = {
  cpg: "from-green-500/10 to-transparent border-green-500/20 hover:border-green-500/50",
  retail: "from-blue-500/10 to-transparent border-blue-500/20 hover:border-blue-500/50",
  tmt: "from-yellow-500/10 to-transparent border-yellow-500/20 hover:border-yellow-500/50",
  bfsi: "from-purple-500/10 to-transparent border-purple-500/20 hover:border-purple-500/50",
};

const STATS = [
  { value: "4", label: "Industries" },
  { value: "21", label: "Use Cases" },
  { value: "500+", label: "ML Features" },
];

const CAPABILITIES = [
  {
    icon: BarChart3,
    color: "#FFD822",
    title: "Business Analytics Layer",
    desc: "Decision intelligence with diagnostics, risk intel, retention actions, and business impact dashboards — tailored per use case.",
  },
  {
    icon: Zap,
    color: "#22c55e",
    title: "ML Orion Factory",
    desc: "End-to-end ML lifecycle: data ingestion, EDA, experiment lab, model governance, deployment and scoring in a unified factory.",
  },
  {
    icon: Globe,
    color: "#3b82f6",
    title: "Multi-Industry Intelligence",
    desc: "CPG, Retail, TMT and BFSI — each with dedicated use cases, domain-specific features, target variables and evaluation frameworks.",
  },
  {
    icon: TrendingUp,
    color: "#a855f7",
    title: "Adaptive ML Models",
    desc: "Use-case specific algorithms, feature sets, and evaluation metrics — from churn prediction to fraud detection and demand forecasting.",
  },
];

export default function LandingPage() {
  const [, navigate] = useLocation();
  const [activeIndustry, setActiveIndustry] = useState<string | null>(null);

  function handleUseCase(industryId: string, useCaseId: string, route?: string) {
    if (route) {
      navigate(route);
    } else {
      navigate(`/demo/${industryId}/${useCaseId}`);
    }
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* ── HERO ── */}
      <div className="border-b border-white/8 bg-gradient-to-br from-[#FFD822]/5 via-transparent to-transparent">
        <div className="max-w-7xl mx-auto px-6 py-14">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#FFD822" }}>
              <Zap className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="text-xs font-bold tracking-[0.25em] uppercase" style={{ color: "#FFD822" }}>ML Orion</div>
              <div className="text-[10px] text-white/40 tracking-wider">Decision Intelligence Platform</div>
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight leading-tight mb-4 max-w-2xl">
            Enterprise AI for<br />
            <span style={{ color: "#FFD822" }}>Every Industry Decision</span>
          </h1>
          <p className="text-white/55 text-base leading-relaxed mb-8 max-w-xl">
            Select your industry and use case to explore end-to-end predictive intelligence — from customer churn to revenue optimization, demand forecasting, and risk analytics.
          </p>
          <div className="flex items-center gap-8">
            {STATS.map(s => (
              <div key={s.label}>
                <div className="text-2xl font-bold" style={{ color: "#FFD822" }}>{s.value}</div>
                <div className="text-[10px] text-white/40 uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── INDUSTRY GRID ── */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-white/80 uppercase tracking-widest">Select Industry &amp; Use Case</h2>
          <p className="text-xs text-white/40 mt-1">Click an industry to expand, then select a use case to open the full analytics platform</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {INDUSTRIES.map(industry => {
            const Icon = INDUSTRY_ICONS[industry.id];
            const isOpen = activeIndustry === industry.id;
            return (
              <div
                key={industry.id}
                className={`rounded-xl border bg-gradient-to-br transition-all duration-200 ${INDUSTRY_GRADIENT[industry.id]}`}
              >
                <button
                  className="w-full text-left p-5 flex items-center justify-between"
                  onClick={() => setActiveIndustry(isOpen ? null : industry.id)}
                  data-testid={`industry-card-${industry.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center border"
                      style={{ backgroundColor: `${industry.color}18`, borderColor: `${industry.color}40` }}>
                      <Icon className="w-5 h-5" style={{ color: industry.color }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: industry.color }}>{industry.name}</span>
                        <span className="text-[10px] font-medium text-white/50 border border-white/10 rounded px-1.5 py-0.5">
                          {industry.useCases.length} use cases
                        </span>
                      </div>
                      <p className="text-xs text-white/50 mt-0.5">{industry.fullName}</p>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-white/40 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
                </button>
                <p className="px-5 pb-3 text-[11px] text-white/35 -mt-2">{industry.description}</p>

                {isOpen && (
                  <div className="border-t border-white/8 divide-y divide-white/5">
                    {industry.useCases.map(uc => {
                      const tagCls = TAG_COLORS[uc.tag] ?? "bg-white/10 text-white/60 border-white/20";
                      return (
                        <button
                          key={uc.id}
                          className="w-full text-left px-5 py-3.5 flex items-center justify-between hover:bg-white/5 transition-colors group"
                          onClick={() => handleUseCase(industry.id, uc.id, uc.route)}
                          data-testid={`usecase-${industry.id}-${uc.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: industry.color + "99" }}
                            />
                            <div>
                              <div className="text-xs font-medium text-white/90 group-hover:text-white transition-colors">{uc.name}</div>
                              <div className="text-[10px] text-white/35 mt-0.5 line-clamp-1 max-w-xs">{uc.description}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide ${tagCls}`}>{uc.tag}</span>
                            <ArrowRight className="w-3 h-3 text-white/25 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── CAPABILITIES ── */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {CAPABILITIES.map(cap => (
            <div key={cap.title} className="rounded-xl border border-white/8 bg-white/3 p-5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: `${cap.color}20` }}>
                <cap.icon className="w-4 h-4" style={{ color: cap.color }} />
              </div>
              <h3 className="text-xs font-semibold text-white mb-1.5">{cap.title}</h3>
              <p className="text-[11px] text-white/40 leading-relaxed">{cap.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
