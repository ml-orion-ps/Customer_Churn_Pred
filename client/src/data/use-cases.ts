export interface KpiDef {
  label: string;
  value: string;
  trend: string;
  up: boolean;
  color: "green" | "red" | "blue" | "amber";
}

export interface TabDef {
  label: string;
  description: string;
  chartType: "line" | "bar" | "area" | "pie";
  chartData: any[];
  insightRows: { label: string; value: string }[];
}

export interface UseCaseDef {
  id: string;
  name: string;
  shortName: string;
  description: string;
  tag: string;
  isLive?: boolean;
  route?: string;
  kpis: KpiDef[];
  businessTabs: TabDef[];
  orionContext: {
    targetVariable: string;
    features: string[];
    algorithms: string[];
    edaHighlights: string[];
  };
}

export interface IndustryDef {
  id: string;
  name: string;
  fullName: string;
  description: string;
  color: string;
  accent: string;
  useCases: UseCaseDef[];
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const quarters = ["Q1 '24", "Q2 '24", "Q3 '24", "Q4 '24", "Q1 '25", "Q2 '25"];

function trendLine(base: number, slope: number, noise: number) {
  return months.map((m, i) => ({ name: m, value: +(base + slope * i + (Math.random() - 0.5) * noise).toFixed(1) }));
}

function barData(labels: string[], values: number[], key = "value") {
  return labels.map((name, i) => ({ name, [key]: values[i] }));
}

export const INDUSTRIES: IndustryDef[] = [
  {
    id: "cpg",
    name: "CPG",
    fullName: "Consumer Packaged Goods",
    description: "Revenue growth management, demand intelligence & brand analytics",
    color: "#22c55e",
    accent: "green",
    useCases: [
      {
        id: "price-promo",
        name: "Price & Promo Optimization",
        shortName: "RGM – Price & Promo",
        description: "AI-driven price elasticity modeling and promotional lift prediction to maximize revenue and margin across channels.",
        tag: "RGM",
        kpis: [
          { label: "Revenue Uplift", value: "+8.3%", trend: "↑ vs prior quarter", up: true, color: "green" },
          { label: "Promo ROI", value: "3.2×", trend: "↑ 0.4× QoQ", up: true, color: "green" },
          { label: "Price Elasticity", value: "−1.8", trend: "Category avg −2.1", up: true, color: "blue" },
          { label: "Cannibalization", value: "12.4%", trend: "↓ 1.8pp vs target", up: false, color: "amber" },
        ],
        businessTabs: [
          {
            label: "Price Analysis",
            description: "Revenue impact by price band across SKUs and channels",
            chartType: "bar",
            chartData: barData(["<$5", "$5–10", "$10–15", "$15–20", "$20+"], [18, 34, 28, 12, 8], "revenue"),
            insightRows: [
              { label: "Optimal Price Band", value: "$5–$10 (max elasticity)" },
              { label: "Price Gaps vs Competitor", value: "3 SKUs overpriced by >15%" },
              { label: "Margin-at-Risk SKUs", value: "7 SKUs below hurdle" },
              { label: "Recommended Action", value: "Reprice 3 SKUs, hold 4" },
            ],
          },
          {
            label: "Promo Performance",
            description: "Promotional lift vs baseline across retailer accounts",
            chartType: "bar",
            chartData: barData(["Walmart", "Target", "Kroger", "Costco", "Safeway"], [42, 31, 28, 19, 14], "lift"),
            insightRows: [
              { label: "Best-Performing Promo", value: "BOGO – 42% lift at Walmart" },
              { label: "Worst-Performing Promo", value: "10% Off – 4% lift at Safeway" },
              { label: "Promo Spend at Risk", value: "$2.1M underperforming" },
              { label: "Recommended Cut", value: "Reduce Safeway 10% Off spend" },
            ],
          },
          {
            label: "Market Response",
            description: "Price-volume elasticity curve and cross-price effects",
            chartType: "line",
            chartData: trendLine(100, 2.1, 8),
            insightRows: [
              { label: "Own-Price Elasticity", value: "−1.8 (inelastic zone)" },
              { label: "Cross-Price Effect", value: "+0.6 vs Brand B" },
              { label: "Saturation Point", value: "$14.99 price ceiling" },
              { label: "Volume at Optimal Price", value: "142K units/month" },
            ],
          },
          {
            label: "Competitive Positioning",
            description: "Price index vs competition by category",
            chartType: "bar",
            chartData: barData(["Brand A (us)", "Brand B", "Brand C", "PL", "Brand D"], [100, 94, 108, 72, 112], "index"),
            insightRows: [
              { label: "Price Index vs Category", value: "100 (at parity)" },
              { label: "Premium Opportunity", value: "2 SKUs can support +8% price" },
              { label: "PL Threat Level", value: "Medium (28% share gap)" },
              { label: "Recommended Response", value: "Value-pack launch for PL defense" },
            ],
          },
        ],
        orionContext: {
          targetVariable: "revenue_uplift_pct",
          features: ["base_price", "promo_depth", "display_flag", "feature_flag", "competitor_price", "season_index", "distribution_pct", "aco_weeks"],
          algorithms: ["Gradient Boosting", "Linear Regression", "Ridge Regression", "Random Forest"],
          edaHighlights: ["Price distribution skewed right", "Promo depth correlates 0.64 with lift", "Seasonal peaks in Q4"],
        },
      },
      {
        id: "demand-forecasting",
        name: "Demand Forecasting",
        shortName: "Demand Forecasting",
        description: "SKU-level demand prediction with seasonality decomposition to reduce stockouts and excess inventory.",
        tag: "Operations",
        kpis: [
          { label: "Forecast Accuracy", value: "91.2%", trend: "↑ 2.1pp MoM", up: true, color: "green" },
          { label: "MAPE", value: "6.4%", trend: "Target <8%", up: true, color: "green" },
          { label: "Bias", value: "−0.8%", trend: "Near-zero ideal", up: true, color: "blue" },
          { label: "Service Level", value: "96.5%", trend: "↑ 1.2pp vs plan", up: true, color: "green" },
        ],
        businessTabs: [
          {
            label: "Forecast vs Actual",
            description: "Model predictions vs actual demand over rolling 12 months",
            chartType: "line",
            chartData: months.map((m, i) => ({ name: m, forecast: 820 + i * 12 + Math.round(Math.random() * 30), actual: 810 + i * 11 + Math.round(Math.random() * 40) })),
            insightRows: [
              { label: "Best Forecast Accuracy", value: "Personal Care – 94.8%" },
              { label: "Worst Accuracy", value: "Beverages – 84.2%" },
              { label: "Avg Forecast Horizon", value: "13 weeks rolling" },
              { label: "SKUs Under Forecast", value: "42 of 380 reviewed" },
            ],
          },
          {
            label: "Seasonality Patterns",
            description: "Seasonal index by month and category",
            chartType: "bar",
            chartData: months.map((m, i) => ({ name: m, index: [92, 88, 95, 102, 108, 112, 118, 115, 104, 128, 134, 142][i] })),
            insightRows: [
              { label: "Peak Month", value: "December (index 142)" },
              { label: "Trough Month", value: "February (index 88)" },
              { label: "Holiday Lift", value: "+38% vs base period" },
              { label: "Categories Affected", value: "Gifting, Snacks, Beverages" },
            ],
          },
          {
            label: "Category Outlook",
            description: "12-week demand outlook by category",
            chartType: "bar",
            chartData: barData(["Personal Care", "Food", "Beverage", "Household", "Snacks"], [94, 88, 84, 91, 96], "accuracy"),
            insightRows: [
              { label: "Highest Risk Category", value: "Beverage (high variance)" },
              { label: "Demand Signal Quality", value: "Food: Strong POS signal" },
              { label: "New Launch Adjustment", value: "3 NPDs need baseline reset" },
              { label: "Promo Overlay Applied", value: "8 planned events factored" },
            ],
          },
          {
            label: "Exception Management",
            description: "High-error SKUs requiring manual review",
            chartType: "bar",
            chartData: barData(["SKU-A021", "SKU-B089", "SKU-C14", "SKU-D002", "SKU-E77"], [24, 19, 17, 15, 12], "mape"),
            insightRows: [
              { label: "SKUs Flagged (MAPE >20%)", value: "17 of 380" },
              { label: "Root Cause – #1", value: "Distribution change (6 SKUs)" },
              { label: "Root Cause – #2", value: "Competitor promo (4 SKUs)" },
              { label: "Action Required", value: "Manual baseline adjustment" },
            ],
          },
        ],
        orionContext: {
          targetVariable: "demand_units",
          features: ["lag_4wk_demand", "lag_13wk_demand", "season_index", "promo_flag", "price", "distribution_pct", "new_sku_flag", "category_trend"],
          algorithms: ["XGBoost", "LSTM", "SARIMA", "Random Forest", "Prophet"],
          edaHighlights: ["Strong autocorrelation at lag-4 and lag-13", "Seasonal peak in Q4", "Promo events create demand spikes"],
        },
      },
      {
        id: "trade-promotion",
        name: "Trade Promotion Effectiveness",
        shortName: "Trade Promo Analytics",
        description: "Measure and optimize trade spend ROI across retailer accounts with AI-driven incremental volume attribution.",
        tag: "RGM",
        kpis: [
          { label: "Trade Spend ROI", value: "2.1×", trend: "↑ 0.3× vs prior", up: true, color: "green" },
          { label: "Volume Lift", value: "+14%", trend: "Category avg +9%", up: true, color: "green" },
          { label: "Baseline Units", value: "82K", trend: "Stable vs last quarter", up: true, color: "blue" },
          { label: "Retailer Compliance", value: "78%", trend: "↓ 4pp vs target", up: false, color: "amber" },
        ],
        businessTabs: [
          {
            label: "Promotion Analytics",
            description: "Pre/during/post promo performance decomposition",
            chartType: "bar",
            chartData: quarters.map((q, i) => ({ name: q, incremental: [12, 15, 18, 14, 16, 19][i], baseline: [80, 82, 84, 83, 85, 86][i] })),
            insightRows: [
              { label: "Avg Incremental Volume", value: "+15.7K units per event" },
              { label: "Pull-Forward Effect", value: "3.2 weeks post-promo dip" },
              { label: "Best Promo Mechanic", value: "BOGO (2.8× ROI)" },
              { label: "Least Efficient", value: "Temporary Price Reduction" },
            ],
          },
          {
            label: "Retailer Performance",
            description: "Trade ROI ranking by key accounts",
            chartType: "bar",
            chartData: barData(["Walmart", "Target", "Kroger", "Costco", "CVS"], [2.8, 2.4, 2.1, 1.9, 1.6], "roi"),
            insightRows: [
              { label: "Top Account ROI", value: "Walmart – 2.8×" },
              { label: "Below-Threshold Accounts", value: "CVS, Rite Aid (<1.5× ROI)" },
              { label: "Compliance Gap – Kroger", value: "72% vs 90% target" },
              { label: "Recommended Action", value: "Reduce Rite Aid event count" },
            ],
          },
          {
            label: "Category Benchmarking",
            description: "ROI vs category norm by promotion type",
            chartType: "bar",
            chartData: barData(["BOGO", "TPR", "Display", "Feature", "Feature+Display"], [2.8, 1.4, 1.8, 2.1, 3.2], "roi"),
            insightRows: [
              { label: "Best Promo Combination", value: "Feature + Display (3.2×)" },
              { label: "Category Norm", value: "2.0× all-in ROI" },
              { label: "TPR-only Efficiency", value: "Below par (1.4×)" },
              { label: "Recommended Shift", value: "+20% budget to Feature+Display" },
            ],
          },
          {
            label: "Spend Optimization",
            description: "Budget reallocation model for next quarter",
            chartType: "bar",
            chartData: barData(["Current", "Optimized"], [2.1, 2.8], "roi"),
            insightRows: [
              { label: "Trade Spend Budget", value: "$18.4M quarterly" },
              { label: "Reallocatable Spend", value: "$3.2M (17% of budget)" },
              { label: "Projected ROI Uplift", value: "+0.7× with reallocation" },
              { label: "Incremental Revenue", value: "+$8.2M if optimized" },
            ],
          },
        ],
        orionContext: {
          targetVariable: "incremental_volume_pct",
          features: ["promo_type", "promo_depth", "display_flag", "feature_flag", "retailer_id", "category", "season_index", "baseline_velocity"],
          algorithms: ["Gradient Boosting", "Random Forest", "Linear Regression"],
          edaHighlights: ["Promo depth >30% drives diminishing returns", "Display+Feature combos outperform single tactics", "Post-promo dip averages 3.2 weeks"],
        },
      },
      {
        id: "shelf-optimization",
        name: "Shelf Space Optimization",
        shortName: "Shelf & Distribution",
        description: "AI-powered planogram optimization and distribution analytics to maximize shelf productivity.",
        tag: "Distribution",
        kpis: [
          { label: "Space Productivity", value: "124 idx", trend: "↑ 8 pts vs baseline", up: true, color: "green" },
          { label: "Facings Optimal", value: "67%", trend: "Target 80%", up: false, color: "amber" },
          { label: "OOS Rate", value: "3.2%", trend: "↓ 0.8pp MoM", up: true, color: "green" },
          { label: "Revenue per SKU", value: "$4.2K", trend: "↑ $0.3K vs prior", up: true, color: "blue" },
        ],
        businessTabs: [
          {
            label: "Space Allocation",
            description: "Revenue per linear foot by category",
            chartType: "bar",
            chartData: barData(["Personal Care", "Snacks", "Beverages", "Household", "Baby"], [142, 128, 116, 94, 88], "rev_per_foot"),
            insightRows: [
              { label: "Highest Revenue/Ft", value: "Personal Care – $142/ft" },
              { label: "Space-to-Sales Mismatch", value: "Beverages overallocated +12ft" },
              { label: "Recommended Rebalance", value: "+6ft to Personal Care" },
              { label: "Revenue Uplift Potential", value: "+$420K/year" },
            ],
          },
          {
            label: "SKU Performance",
            description: "Sales velocity vs shelf presence by SKU",
            chartType: "bar",
            chartData: barData(["Top 10%", "10–30%", "30–60%", "60–80%", "Bottom 20%"], [68, 82, 74, 61, 34], "revenue_idx"),
            insightRows: [
              { label: "Top SKU Facings", value: "Avg 4.2 facings (correct)" },
              { label: "Long-Tail SKUs", value: "42 SKUs below 0.2 turns/wk" },
              { label: "Delist Candidates", value: "18 SKUs recommended" },
              { label: "New Item Success Rate", value: "62% achieve velocity target" },
            ],
          },
          {
            label: "Distribution Coverage",
            description: "Weighted distribution by channel and SKU tier",
            chartType: "bar",
            chartData: barData(["Tier 1", "Tier 2", "Tier 3", "Core+", "Hero"], [96, 88, 74, 92, 99], "wd_pct"),
            insightRows: [
              { label: "Core SKU WD%", value: "96.2% (on target)" },
              { label: "Distribution Voids", value: "Tier 3: 26% gap vs plan" },
              { label: "Regional Gaps", value: "Southeast: 12 SKUs underserved" },
              { label: "Priority Action", value: "Tier 3 gap closure program" },
            ],
          },
          {
            label: "Category Adjacency",
            description: "Cross-category affinity and aisle sequencing",
            chartType: "bar",
            chartData: barData(["Snacks–Bev", "PC–Baby", "HH–Laundry", "Snacks–HH", "Bev–Dairy"], [0.82, 0.74, 0.68, 0.41, 0.38], "affinity"),
            insightRows: [
              { label: "Strongest Adjacency", value: "Snacks ↔ Beverages (0.82)" },
              { label: "Basket Transfer Potential", value: "+$0.42 per trip" },
              { label: "Recommended Adjacency Move", value: "PC next to Baby Care" },
              { label: "Revenue Impact", value: "+$180K/year at Walmart pilot" },
            ],
          },
        ],
        orionContext: {
          targetVariable: "revenue_per_linear_foot",
          features: ["num_facings", "wd_pct", "price", "velocity", "promo_flag", "category", "aisle_position", "adjacency_score"],
          algorithms: ["Gradient Boosting", "Random Forest", "Linear Regression"],
          edaHighlights: ["Velocity and facings show 0.71 correlation", "Aisle-end outperforms mid-aisle by 28%", "OOS strongly linked to facings below 2"],
        },
      },
      {
        id: "brand-health",
        name: "Brand Health Monitoring",
        shortName: "Brand Analytics",
        description: "Real-time brand equity tracking, sentiment analysis and competitive benchmarking to protect and grow brand value.",
        tag: "Marketing",
        kpis: [
          { label: "Brand Equity Score", value: "72/100", trend: "↑ 3 pts QoQ", up: true, color: "green" },
          { label: "NPS", value: "34", trend: "Category avg 28", up: true, color: "green" },
          { label: "Purchase Intent", value: "41%", trend: "↓ 2pp vs prior", up: false, color: "amber" },
          { label: "Share of Voice", value: "18.3%", trend: "↑ 1.4pp YoY", up: true, color: "blue" },
        ],
        businessTabs: [
          {
            label: "Brand Tracking",
            description: "Brand equity KPIs over rolling 12 months",
            chartType: "line",
            chartData: months.map((m, i) => ({ name: m, equity: 64 + i * 0.7 + Math.round(Math.random() * 3), awareness: 72 + i * 0.4 + Math.round(Math.random() * 2) })),
            insightRows: [
              { label: "Aided Awareness", value: "84% (↑ 3pp YoY)" },
              { label: "Unaided Awareness", value: "42% (category leader)" },
              { label: "Top-of-Mind", value: "18% (2nd in category)" },
              { label: "Brand Love Score", value: "6.8/10" },
            ],
          },
          {
            label: "Competitor Benchmarking",
            description: "Equity index vs top 3 competitors",
            chartType: "bar",
            chartData: barData(["Our Brand", "Brand B", "Brand C", "Brand D", "PL"], [72, 68, 64, 58, 41], "equity"),
            insightRows: [
              { label: "Category Rank", value: "#1 in equity (of 5)" },
              { label: "Gap to #2", value: "+4 pts equity advantage" },
              { label: "Fastest-Growing Competitor", value: "Brand C (+8 pts YoY)" },
              { label: "Vulnerability", value: "Price perception vs PL" },
            ],
          },
          {
            label: "Sentiment Analysis",
            description: "Consumer sentiment by attribute and channel",
            chartType: "bar",
            chartData: barData(["Quality", "Value", "Trust", "Innovation", "Sustainability"], [82, 64, 78, 61, 54], "positive_pct"),
            insightRows: [
              { label: "Positive Sentiment Overall", value: "71% (social + reviews)" },
              { label: "Top Positive Theme", value: "Product Quality (82%)" },
              { label: "Weakest Attribute", value: "Sustainability (54%)" },
              { label: "Viral Risk", value: "2 negative threads monitored" },
            ],
          },
          {
            label: "Media Attribution",
            description: "Brand lift contribution by media channel",
            chartType: "bar",
            chartData: barData(["TV", "Digital", "OOH", "Print", "Influencer"], [38, 32, 14, 8, 8], "contribution"),
            insightRows: [
              { label: "Top ROI Channel", value: "Digital video (2.4× ROAS)" },
              { label: "TV Contribution", value: "38% of equity lift" },
              { label: "Influencer Effectiveness", value: "8% lift, high engagement" },
              { label: "Budget Recommendation", value: "+5% to Digital, −5% Print" },
            ],
          },
        ],
        orionContext: {
          targetVariable: "brand_equity_score",
          features: ["media_spend", "sov_pct", "nps_delta", "sentiment_score", "distribution_pct", "promo_frequency", "innovation_index", "category_growth"],
          algorithms: ["Random Forest", "Linear Regression", "XGBoost"],
          edaHighlights: ["Media spend shows diminishing returns above $12M", "SOV and equity correlated 0.76", "Social sentiment leads NPS by ~6 weeks"],
        },
      },
    ],
  },

  {
    id: "retail",
    name: "Retail",
    fullName: "Retail & E-commerce",
    description: "Customer loyalty, demand intelligence & store performance analytics",
    color: "#3b82f6",
    accent: "blue",
    useCases: [
      {
        id: "customer-loyalty",
        name: "Customer Loyalty Analytics",
        shortName: "Loyalty & Retention",
        description: "Churn prediction and RFM segmentation to protect revenue from at-risk customers and maximize loyalty program ROI.",
        tag: "Retention",
        kpis: [
          { label: "Retention Rate", value: "71.4%", trend: "↓ 1.2pp vs plan", up: false, color: "amber" },
          { label: "Customer LTV", value: "$1,240", trend: "↑ $84 YoY", up: true, color: "green" },
          { label: "At-Risk Customers", value: "4,320", trend: "↑ 320 vs prior month", up: false, color: "red" },
          { label: "Loyalty Efficacy", value: "82%", trend: "Program target 85%", up: false, color: "blue" },
        ],
        businessTabs: [
          {
            label: "Segment Analysis",
            description: "RFM customer segments and churn risk distribution",
            chartType: "bar",
            chartData: barData(["Champions", "Loyal", "Potential", "At Risk", "Lost"], [18, 24, 21, 22, 15], "pct"),
            insightRows: [
              { label: "Champions (top tier)", value: "18% – avg $2,840 LTV" },
              { label: "At-Risk Revenue", value: "$5.4M at high churn risk" },
              { label: "Win-Back Rate", value: "34% of targeted lapsed" },
              { label: "Loyalty Member Share", value: "62% of active customer base" },
            ],
          },
          {
            label: "Churn Prediction",
            description: "Churn probability distribution across customer base",
            chartType: "bar",
            chartData: barData(["<10%", "10–25%", "25–50%", "50–75%", ">75%"], [38, 24, 18, 12, 8], "customers"),
            insightRows: [
              { label: "High-Risk Customers", value: "8,640 (prob >50%)" },
              { label: "Top Churn Driver", value: "90+ days since last purchase" },
              { label: "Model AUC", value: "0.81 (last training)" },
              { label: "Next 30-Day Predicted Churn", value: "2,180 customers" },
            ],
          },
          {
            label: "Retention Actions",
            description: "Intervention effectiveness by offer type",
            chartType: "bar",
            chartData: barData(["10% Off Voucher", "Free Shipping", "Loyalty Points 2×", "Personal Outreach", "Bundle Offer"], [38, 42, 34, 58, 46], "retention_pct"),
            insightRows: [
              { label: "Most Effective", value: "Personal Outreach – 58% save rate" },
              { label: "Highest Scale", value: "Free Shipping (lowest cost)" },
              { label: "Cost per Save", value: "Avg $12.40 per customer" },
              { label: "Campaign ROI", value: "4.2× on retention spend" },
            ],
          },
          {
            label: "Loyalty Economics",
            description: "Revenue contribution and incremental margin by tier",
            chartType: "bar",
            chartData: barData(["Gold", "Silver", "Bronze", "Non-member"], [2840, 1420, 680, 380], "ltv"),
            insightRows: [
              { label: "Loyalty vs Non-Member Spend", value: "+94% higher per annum" },
              { label: "Tier Upgrade Rate", value: "12% Bronze→Silver per quarter" },
              { label: "Program Cost as % Revenue", value: "3.2%" },
              { label: "Net Program ROI", value: "6.8× (revenue attributable)" },
            ],
          },
        ],
        orionContext: {
          targetVariable: "churn_probability",
          features: ["days_since_purchase", "purchase_frequency", "avg_order_value", "loyalty_tier", "channel_mix", "returns_rate", "category_breadth", "discount_sensitivity"],
          algorithms: ["Gradient Boosting", "Random Forest", "Logistic Regression"],
          edaHighlights: ["Days since purchase is top churn predictor", "Multi-category buyers have 3× lower churn", "Loyalty tier strongly moderates purchase frequency"],
        },
      },
      {
        id: "demand-forecasting-retail",
        name: "Demand Forecasting",
        shortName: "Retail Demand Forecast",
        description: "Store and item level demand forecasting to reduce stockouts and excess inventory across all channels.",
        tag: "Inventory",
        kpis: [
          { label: "Forecast Accuracy", value: "88.7%", trend: "↑ 1.4pp vs model v1", up: true, color: "green" },
          { label: "WMAPE", value: "8.1%", trend: "Target <10%", up: true, color: "green" },
          { label: "In-Stock Rate", value: "94.2%", trend: "↑ 0.8pp MoM", up: true, color: "green" },
          { label: "Inventory Turns", value: "8.4×", trend: "Industry avg 7.1×", up: true, color: "blue" },
        ],
        businessTabs: [
          {
            label: "Forecast Performance",
            description: "Forecast accuracy trend by category",
            chartType: "line",
            chartData: months.map((m, i) => ({ name: m, accuracy: 84 + i * 0.4 + Math.round(Math.random() * 2) })),
            insightRows: [
              { label: "Best Category Accuracy", value: "Apparel – 91.4%" },
              { label: "Lowest Accuracy", value: "Seasonal – 78.2%" },
              { label: "Avg Forecast Horizon", value: "8 weeks (store/item)" },
              { label: "Daily vs Weekly Forecast", value: "Daily 3.2pp more accurate" },
            ],
          },
          {
            label: "Store Clusters",
            description: "Store performance clusters for demand similarity",
            chartType: "bar",
            chartData: barData(["Urban Flagship", "Suburban", "Strip Mall", "Rural", "Airport"], [94, 89, 86, 81, 96], "accuracy"),
            insightRows: [
              { label: "Cluster Count", value: "5 clusters across 420 stores" },
              { label: "Best Cluster Accuracy", value: "Airport – 96.1%" },
              { label: "Outlier Stores", value: "18 stores (high variance)" },
              { label: "Recommended Action", value: "Manual override for 18 stores" },
            ],
          },
          {
            label: "Category Outlook",
            description: "12-week forward demand by category",
            chartType: "bar",
            chartData: barData(["Apparel", "Electronics", "Home", "Beauty", "Seasonal"], [88, 84, 91, 89, 74], "accuracy"),
            insightRows: [
              { label: "Highest Growth Signal", value: "Beauty (+12% demand trend)" },
              { label: "At-Risk Category", value: "Seasonal (high weather link)" },
              { label: "Trend Override Applied", value: "Electronics (new product launch)" },
              { label: "Markdown Risk", value: "$4.2M seasonal excess units" },
            ],
          },
          {
            label: "Markdown Planning",
            description: "Clearance timing optimization for seasonal inventory",
            chartType: "bar",
            chartData: quarters.map((q, i) => ({ name: q, markdown_units: [0, 0, 8400, 14200, 0, 0][i], revenue: [0, 0, 840, 1280, 0, 0][i] })),
            insightRows: [
              { label: "Optimal Markdown Week", value: "Week 10 of season (−15%)" },
              { label: "Revenue Recovery", value: "84% of full-price equivalent" },
              { label: "Excess Units at Risk", value: "18,400 units pre-season" },
              { label: "AI Recommendation", value: "Progressive 5→15→25% markdown" },
            ],
          },
        ],
        orionContext: {
          targetVariable: "demand_units",
          features: ["lag_sales", "store_cluster", "category", "price", "promo_flag", "season_flag", "weather_index", "online_signal"],
          algorithms: ["XGBoost", "SARIMA", "LSTM", "Prophet"],
          edaHighlights: ["Strong weekly seasonality (7-day cycle)", "Weather has 0.42 correlation with seasonal demand", "Promo events inflate demand 2–4 weeks ahead"],
        },
      },
      {
        id: "basket-analysis",
        name: "Basket Analysis & Cross-sell",
        shortName: "Basket & Cross-sell",
        description: "Market basket analysis and AI recommendation engine to increase basket size and cross-category revenue.",
        tag: "Revenue",
        kpis: [
          { label: "Avg Basket Size", value: "$68.40", trend: "↑ $4.20 MoM", up: true, color: "green" },
          { label: "Cross-sell Rate", value: "34%", trend: "↑ 3pp vs baseline", up: true, color: "green" },
          { label: "Affinity Score", value: "0.72", trend: "Top-quartile benchmark", up: true, color: "blue" },
          { label: "Revenue per Transaction", value: "$84.20", trend: "↑ 6.2% YoY", up: true, color: "green" },
        ],
        businessTabs: [
          {
            label: "Product Affinity",
            description: "Top product pair association rules (lift)",
            chartType: "bar",
            chartData: barData(["Shoes→Socks", "Shirt→Pants", "Shampoo→Cond.", "Phone→Case", "Coffee→Filters"], [3.8, 3.2, 2.9, 4.1, 2.6], "lift"),
            insightRows: [
              { label: "Strongest Affinity Pair", value: "Phone → Case (lift 4.1)" },
              { label: "Basket Pairs Analyzed", value: "1.2M transactions (90 days)" },
              { label: "Top Category Cross-sell", value: "Electronics → Accessories" },
              { label: "Revenue Opportunity", value: "+$2.4M from pairing nudges" },
            ],
          },
          {
            label: "Category Cross-sell",
            description: "Cross-category purchase rates by primary department",
            chartType: "bar",
            chartData: barData(["Electronics", "Apparel", "Beauty", "Home", "Sports"], [62, 44, 52, 38, 58], "cross_sell_rate"),
            insightRows: [
              { label: "Highest Cross-sell Dept", value: "Electronics – 62% of baskets" },
              { label: "Lowest Cross-sell Dept", value: "Home – 38% (opportunity)" },
              { label: "Online vs In-store", value: "Online: 8pp higher cross-sell" },
              { label: "Personalization Lift", value: "+14pp cross-sell with AI recs" },
            ],
          },
          {
            label: "Customer Segments",
            description: "Basket behavior by customer segment",
            chartType: "bar",
            chartData: barData(["High-Value", "Mid-tier", "Occasional", "New", "Lapsing"], [94, 72, 48, 56, 38], "avg_basket"),
            insightRows: [
              { label: "High-Value Avg Basket", value: "$142 (2.1× overall avg)" },
              { label: "New Customer Basket", value: "$56 (↑ with onboarding email)" },
              { label: "Segment Targeted", value: "Occasional → Mid-tier upgrade" },
              { label: "Upsell Campaign ROI", value: "3.4× on mid-tier segment" },
            ],
          },
          {
            label: "Recommendation Engine",
            description: "Real-time recommendation performance metrics",
            chartType: "bar",
            chartData: barData(["CTR", "Add-to-Cart", "Conversion", "Revenue Attr."], [8.4, 24, 12, 100], "pct"),
            insightRows: [
              { label: "Rec Engine Click Rate", value: "8.4% (industry avg 4.2%)" },
              { label: "Revenue Attributed", value: "11.4% of total online revenue" },
              { label: "Model (Collaborative Filter)", value: "AUC 0.84, Precision@5 0.68" },
              { label: "A/B Test Uplift", value: "+18% basket vs control group" },
            ],
          },
        ],
        orionContext: {
          targetVariable: "basket_value",
          features: ["primary_category", "customer_segment", "channel", "time_of_day", "loyalty_tier", "past_cross_sell_flag", "session_depth", "cart_abandonment"],
          algorithms: ["Collaborative Filtering", "XGBoost", "Association Rules", "Neural CF"],
          edaHighlights: ["Electronics category has highest affinity diversity", "Loyalty members show 2.1× cross-sell propensity", "Weekend baskets average 14% larger"],
        },
      },
      {
        id: "inventory-optimization",
        name: "Inventory Optimization",
        shortName: "Inventory Intelligence",
        description: "AI-driven safety stock optimization and replenishment planning to minimize carrying costs and stockouts.",
        tag: "Operations",
        kpis: [
          { label: "Inventory Turns", value: "8.4×", trend: "↑ 0.6× vs prior year", up: true, color: "green" },
          { label: "Days of Supply", value: "43 days", trend: "Target 40 days", up: false, color: "amber" },
          { label: "Stockout Rate", value: "1.8%", trend: "↓ 0.4pp MoM", up: true, color: "green" },
          { label: "Carrying Cost", value: "$2.1M", trend: "↓ $0.3M vs plan", up: true, color: "green" },
        ],
        businessTabs: [
          {
            label: "Stock Coverage",
            description: "Days of supply by category and ABC classification",
            chartType: "bar",
            chartData: barData(["A-Items", "B-Items", "C-Items", "D-Items (slow)", "New Items"], [28, 42, 68, 94, 54], "days_of_supply"),
            insightRows: [
              { label: "A-Item Coverage", value: "28 days (optimal 21–30)" },
              { label: "D-Item Overstock", value: "94 days – excess carrying cost" },
              { label: "Safety Stock Method", value: "Demand-driven (ML-based)" },
              { label: "Replenishment Frequency", value: "Daily for A/B, Weekly for C/D" },
            ],
          },
          {
            label: "Slow Movers",
            description: "Categories with excess inventory vs velocity",
            chartType: "bar",
            chartData: barData(["Seasonal", "Discontinued", "Low-demand", "Overordered", "Damaged"], [24, 8, 18, 14, 6], "excess_units_k"),
            insightRows: [
              { label: "Total Excess Units", value: "70K units across categories" },
              { label: "Carrying Cost at Risk", value: "$840K per quarter" },
              { label: "Recommended Action", value: "Progressive markdown for 42K units" },
              { label: "Liquidation Candidates", value: "28K units – 3P liquidation" },
            ],
          },
          {
            label: "Category Health",
            description: "Inventory health score by department",
            chartType: "bar",
            chartData: barData(["Electronics", "Apparel", "Home", "Beauty", "Sports"], [84, 72, 68, 88, 76], "health_score"),
            insightRows: [
              { label: "Healthiest Category", value: "Beauty – score 88/100" },
              { label: "Most At-Risk", value: "Home – score 68 (overstock)" },
              { label: "Inventory Accuracy (cycle count)", value: "97.4% perpetual inv." },
              { label: "Shrinkage Rate", value: "0.8% (below 1.0% industry)" },
            ],
          },
          {
            label: "Replenishment Intelligence",
            description: "AI replenishment recommendation engine output",
            chartType: "bar",
            chartData: barData(["On-time", "Early", "Late", "Cancelled", "Emergency"], [72, 14, 8, 4, 2], "pct"),
            insightRows: [
              { label: "Replenishment On-Time Rate", value: "72% (target 85%)" },
              { label: "Avg Lead Time", value: "4.2 days (↓ 0.8 days)" },
              { label: "AI Override Rate", value: "12% of system suggestions" },
              { label: "Forecast Improvement Plan", value: "Integration with vendor VMI" },
            ],
          },
        ],
        orionContext: {
          targetVariable: "optimal_safety_stock",
          features: ["velocity_rank", "lead_time", "demand_variability", "supplier_reliability", "seasonal_flag", "abc_class", "days_of_supply", "stockout_cost"],
          algorithms: ["Gradient Boosting", "Linear Regression", "Simulation-based Optimization"],
          edaHighlights: ["Lead time variability drives 40% of safety stock need", "Seasonal items need 3× base safety stock", "C/D items overweighted in current replenishment"],
        },
      },
      {
        id: "store-performance",
        name: "Store Performance Analytics",
        shortName: "Store Analytics",
        description: "Comp store benchmarking, footfall analysis and conversion intelligence to identify revenue growth opportunities.",
        tag: "Analytics",
        kpis: [
          { label: "Sales/Sq.Ft", value: "$412", trend: "↑ $28 YoY", up: true, color: "green" },
          { label: "Footfall Trend", value: "+3.2%", trend: "↑ vs −1.1% category", up: true, color: "green" },
          { label: "Conversion Rate", value: "28.4%", trend: "↑ 1.8pp vs prior", up: true, color: "green" },
          { label: "Comp Store Growth", value: "+1.8%", trend: "Industry avg +0.4%", up: true, color: "blue" },
        ],
        businessTabs: [
          {
            label: "Store Benchmarking",
            description: "Store performance ranking vs format peers",
            chartType: "bar",
            chartData: barData(["Top 20%", "20–40%", "40–60%", "60–80%", "Bottom 20%"], [480, 440, 400, 360, 310], "sales_per_sqft"),
            insightRows: [
              { label: "Top Quintile Threshold", value: ">$460/sq.ft" },
              { label: "Underperforming Stores", value: "42 stores (bottom 20%)" },
              { label: "Avg Gap to Peer Median", value: "−$90/sq.ft for bottom tier" },
              { label: "AI Opportunity Score", value: "14 stores show uplift potential" },
            ],
          },
          {
            label: "Traffic Patterns",
            description: "Hourly and daily footfall patterns by format",
            chartType: "bar",
            chartData: barData(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], [62, 58, 64, 68, 84, 100, 86], "footfall_idx"),
            insightRows: [
              { label: "Peak Day", value: "Saturday (index 100)" },
              { label: "Peak Hour", value: "12–2pm and 5–7pm" },
              { label: "Staff:Traffic Alignment", value: "72% stores optimally staffed" },
              { label: "Opportunity", value: "Thursday evening underfunded" },
            ],
          },
          {
            label: "Staff Productivity",
            description: "Revenue per labor hour by format",
            chartType: "bar",
            chartData: barData(["Flagship", "Suburban", "Strip Mall", "Rural", "Airport"], [124, 108, 96, 84, 148], "rev_per_labor_hr"),
            insightRows: [
              { label: "Best Revenue/Labor Hour", value: "Airport – $148" },
              { label: "Optimal Staff:Sales Ratio", value: "1 FTE per $480K revenue" },
              { label: "Scheduling AI Accuracy", value: "88% vs manual scheduling" },
              { label: "Overtime Rate", value: "4.2% (target <3%)" },
            ],
          },
          {
            label: "Format Analysis",
            description: "P&L and productivity by store format",
            chartType: "bar",
            chartData: barData(["Flagship", "Suburban", "Strip Mall", "Rural", "Airport"], [8.4, 7.2, 6.8, 5.9, 9.1], "ebitda_pct"),
            insightRows: [
              { label: "Highest EBITDA%", value: "Airport – 9.1%" },
              { label: "Lowest EBITDA%", value: "Rural – 5.9% (rent-driven)" },
              { label: "New Format Performance", value: "Micro-format pilot: 7.8% EBITDA" },
              { label: "Closure Candidates", value: "6 rural stores (ROI negative)" },
            ],
          },
        ],
        orionContext: {
          targetVariable: "sales_per_sqft",
          features: ["footfall", "conversion_rate", "basket_size", "staff_hours", "store_size", "format", "location_score", "competitor_proximity"],
          algorithms: ["Gradient Boosting", "Linear Regression", "Clustering"],
          edaHighlights: ["Conversion rate is strongest predictor of sales/sqft", "Location score shows 0.68 correlation with footfall", "Flagship format has highest variance in performance"],
        },
      },
    ],
  },

  {
    id: "tmt",
    name: "TMT",
    fullName: "Telecom, Media & Technology",
    description: "Churn intelligence, revenue optimization & subscriber analytics",
    color: "#FFD822",
    accent: "yellow",
    useCases: [
      {
        id: "customer-churn",
        name: "Customer Churn",
        shortName: "Customer Churn Intelligence",
        description: "End-to-end ML-powered customer churn prediction, risk stratification and automated retention workflow for telecom operators.",
        tag: "Retention",
        isLive: true,
        route: "/",
        kpis: [],
        businessTabs: [],
        orionContext: { targetVariable: "is_churned", features: [], algorithms: [], edaHighlights: [] },
      },
      {
        id: "arpu-optimization",
        name: "ARPU Optimization",
        shortName: "ARPU & Revenue Growth",
        description: "Propensity modeling and personalized offer recommendations to drive sustainable ARPU growth through upgrades and bundling.",
        tag: "Revenue",
        kpis: [
          { label: "ARPU", value: "$67.40", trend: "↑ $3.20 YoY", up: true, color: "green" },
          { label: "Upgrade Rate", value: "12.3%", trend: "↑ 1.8pp vs plan", up: true, color: "green" },
          { label: "Bundle Attach Rate", value: "68%", trend: "Target 72%", up: false, color: "amber" },
          { label: "Revenue at Risk", value: "$4.2M", trend: "Downgrades + disconnects", up: false, color: "red" },
        ],
        businessTabs: [
          {
            label: "ARPU Segmentation",
            description: "ARPU distribution and trend by customer segment",
            chartType: "bar",
            chartData: barData(["Platinum", "Gold", "Silver", "Bronze", "Pay-as-go"], [142, 94, 68, 42, 18], "arpu"),
            insightRows: [
              { label: "Top Segment ARPU", value: "Platinum – $142/month" },
              { label: "ARPU Growth Segment", value: "Silver→Gold upgrade pipeline" },
              { label: "Downsell Risk", value: "840 Gold customers flagged" },
              { label: "Addressable ARPU Gap", value: "$12.40/month per mid-tier" },
            ],
          },
          {
            label: "Upgrade Propensity",
            description: "Model scores and upgrade conversion by offer type",
            chartType: "bar",
            chartData: barData(["Speed Upgrade", "Bundle Add", "Premium TV", "Mobile Add", "Smart Home"], [24, 18, 14, 21, 11], "conversion_pct"),
            insightRows: [
              { label: "Highest Conversion Offer", value: "Speed Upgrade – 24%" },
              { label: "Propensity Model AUC", value: "0.79 (last run)" },
              { label: "High-Propensity Pool", value: "12,400 customers (score >0.7)" },
              { label: "Revenue Potential", value: "+$2.8M if high-propensity converted" },
            ],
          },
          {
            label: "Bundle Analysis",
            description: "Bundle penetration and incremental revenue by tier",
            chartType: "bar",
            chartData: barData(["Internet Only", "Int+TV", "Int+Mobile", "Triple Play", "Quadruple"], [28, 42, 34, 38, 18], "penetration"),
            insightRows: [
              { label: "Best Bundle (Retention)", value: "Triple Play – 3.2% churn" },
              { label: "Bundle Expansion Rate", value: "18% of single-product upgrade" },
              { label: "Avg Bundle Revenue Uplift", value: "+$24/month vs single product" },
              { label: "Next Best Bundle Rec", value: "Int Only → Int+Mobile (12K eligible)" },
            ],
          },
          {
            label: "Pricing Intelligence",
            description: "Price sensitivity analysis and elasticity by segment",
            chartType: "bar",
            chartData: barData(["Platinum", "Gold", "Silver", "Bronze"], [-0.4, -0.8, -1.4, -2.1], "elasticity"),
            insightRows: [
              { label: "Most Price-Sensitive", value: "Bronze (-2.1 elasticity)" },
              { label: "Inelastic Segments", value: "Platinum (-0.4), Gold (-0.8)" },
              { label: "Optimal Price Increase", value: "+$3/month for Gold (low risk)" },
              { label: "Revenue Opportunity", value: "+$1.4M from targeted price increase" },
            ],
          },
        ],
        orionContext: {
          targetVariable: "arpu_next_quarter",
          features: ["current_arpu", "tenure_months", "bundle_count", "nps_score", "upgrade_history", "competitor_available", "payment_history", "data_usage_gb"],
          algorithms: ["Gradient Boosting", "Linear Regression", "Random Forest"],
          edaHighlights: ["Bundle count is strongest ARPU predictor", "Tenure >24 months correlates with willingness to upgrade", "Data usage growth signals upgrade readiness"],
        },
      },
      {
        id: "network-quality",
        name: "Network Quality Impact",
        shortName: "Network Quality Analytics",
        description: "Correlate network performance metrics with customer experience and predict complaint/churn risk from network events.",
        tag: "Operations",
        kpis: [
          { label: "Network NPS", value: "42", trend: "↑ 3 pts QoQ", up: true, color: "green" },
          { label: "Complaint Rate", value: "2.8%", trend: "↓ 0.4pp MoM", up: true, color: "green" },
          { label: "Downtime Revenue Impact", value: "$1.2M", trend: "↓ $0.3M vs last quarter", up: true, color: "amber" },
          { label: "Network Coverage Score", value: "94%", trend: "Target 96% by Q4", up: false, color: "blue" },
        ],
        businessTabs: [
          {
            label: "Network Diagnostics",
            description: "Network event impact on customer satisfaction",
            chartType: "line",
            chartData: months.map((m, i) => ({ name: m, events: Math.round(420 - i * 12 + Math.random() * 30), nps: Math.round(36 + i * 0.5 + Math.random() * 3) })),
            insightRows: [
              { label: "Avg Outage Duration", value: "2.4 hours per incident" },
              { label: "NPS Impact per Outage", value: "−4.2 pts per >4hr outage" },
              { label: "Most Affected Region", value: "Northeast – 18% of tickets" },
              { label: "Resolution Time SLA", value: "84% resolved within 4 hours" },
            ],
          },
          {
            label: "Regional Analysis",
            description: "Network quality score by region and complaint hotspots",
            chartType: "bar",
            chartData: barData(["Northeast", "Southeast", "Midwest", "Southwest", "West"], [84, 92, 88, 94, 96], "quality_score"),
            insightRows: [
              { label: "Highest Risk Region", value: "Northeast – score 84" },
              { label: "Complaints per 100 Customers", value: "3.8 in Northeast (avg 2.8)" },
              { label: "Churn-Network Correlation", value: "0.68 (high correlation)" },
              { label: "Capex Priority", value: "Northeast upgrade Q3 $4.2M" },
            ],
          },
          {
            label: "Quality-Churn Correlation",
            description: "Network quality vs churn rate by network zone",
            chartType: "bar",
            chartData: barData(["Score >90", "80–90", "70–80", "60–70", "<60"], [4.2, 8.4, 14.2, 21.8, 34.6], "churn_rate"),
            insightRows: [
              { label: "Churn Rate in Poor Coverage", value: "34.6% (vs 4.2% excellent)" },
              { label: "Revenue at Risk from Poor Net", value: "$8.4M ARR" },
              { label: "Investment ROI (Net Upgrade)", value: "3.8× in high-churn zones" },
              { label: "Priority Coverage Upgrade", value: "12 zones identified" },
            ],
          },
          {
            label: "SLA Tracking",
            description: "SLA compliance and resolution time trend",
            chartType: "bar",
            chartData: barData(["<1hr", "1–4hr", "4–8hr", "8–24hr", ">24hr"], [42, 28, 14, 12, 4], "pct_of_tickets"),
            insightRows: [
              { label: "SLA Compliance Rate", value: "84% within 4 hours" },
              { label: "Mean Time to Resolution", value: "3.8 hours" },
              { label: "Escalation Rate", value: "4.2% escalate to Tier 3" },
              { label: "Field Visit Required", value: "18% of all tickets" },
            ],
          },
        ],
        orionContext: {
          targetVariable: "complaint_probability",
          features: ["network_score", "outage_count_30d", "avg_speed_delivered", "coverage_pct", "region", "tenure_months", "bundle_type", "nps_score"],
          algorithms: ["Gradient Boosting", "Logistic Regression", "Random Forest"],
          edaHighlights: ["Network score below 70 drives 3× complaint probability", "Outage count in 30 days is top feature", "Rural customers have highest complaint-to-churn conversion"],
        },
      },
      {
        id: "subscriber-ltv",
        name: "Subscriber Lifetime Value",
        shortName: "Subscriber LTV",
        description: "CLV modeling and customer investment prioritization to maximize the economic value of the subscriber base.",
        tag: "Analytics",
        kpis: [
          { label: "Avg Subscriber CLV", value: "$1,840", trend: "↑ $120 YoY", up: true, color: "green" },
          { label: "High-Value Subscribers", value: "28%", trend: "↑ 2pp QoQ", up: true, color: "green" },
          { label: "CLV Distribution Skew", value: "2.3×", trend: "Top 20% = 64% of value", up: true, color: "blue" },
          { label: "Payback Period", value: "14 months", trend: "↓ 1.2mo vs prior model", up: true, color: "green" },
        ],
        businessTabs: [
          {
            label: "CLV Segmentation",
            description: "Customer CLV distribution and segment characteristics",
            chartType: "bar",
            chartData: barData(["Elite (>$3K)", "$2–3K", "$1–2K", "$500–1K", "<$500"], [8, 12, 28, 32, 20], "pct"),
            insightRows: [
              { label: "Elite CLV Segment", value: "8% of base, $4,200 avg CLV" },
              { label: "Growth Opportunity", value: "$1–2K segment (28%): upgrade path" },
              { label: "Low-CLV at-Risk", value: "20% of base – acquisition cost risk" },
              { label: "Median CLV", value: "$1,240 (all subscribers)" },
            ],
          },
          {
            label: "Value Drivers",
            description: "Feature importance for CLV prediction model",
            chartType: "bar",
            chartData: barData(["Tenure", "Bundle Count", "ARPU", "NPS Score", "Payment History", "Data Usage"], [28, 22, 18, 14, 10, 8], "importance"),
            insightRows: [
              { label: "Top CLV Driver", value: "Tenure (28% importance)" },
              { label: "Modifiable Lever #1", value: "Bundle count (22%)" },
              { label: "Modifiable Lever #2", value: "ARPU growth (18%)" },
              { label: "Model R²", value: "0.81 (CLV regression model)" },
            ],
          },
          {
            label: "Investment Prioritization",
            description: "Customer investment tiers by CLV and churn risk",
            chartType: "bar",
            chartData: barData(["Protect (Hi CLV, Hi Risk)", "Grow (Hi CLV, Lo Risk)", "Develop (Lo CLV, Lo Risk)", "Monitor (Lo CLV, Hi Risk)"], [18, 42, 28, 12], "pct"),
            insightRows: [
              { label: "Protect Segment", value: "18% – max intervention budget" },
              { label: "Grow Segment", value: "42% – upsell + deepen engagement" },
              { label: "Develop Segment", value: "28% – loyalty program focus" },
              { label: "Total Addressable CLV Uplift", value: "+$24M over 3 years" },
            ],
          },
          {
            label: "Cohort Analysis",
            description: "CLV evolution by acquisition cohort",
            chartType: "line",
            chartData: quarters.map((q, i) => ({ name: q, cohort_2022: 800 + i * 80, cohort_2023: 750 + i * 90, cohort_2024: 680 + i * 100 })),
            insightRows: [
              { label: "Best Cohort", value: "2022 cohort – $1,840 avg CLV" },
              { label: "Fastest Growing", value: "2024 cohort (+$100 CLV/qtr)" },
              { label: "Payback Period Trend", value: "Improving 1mo per year" },
              { label: "CAC vs LTV Ratio", value: "1:4.2 (target >1:4)" },
            ],
          },
        ],
        orionContext: {
          targetVariable: "predicted_clv_3yr",
          features: ["tenure_months", "monthly_revenue", "bundle_count", "nps_score", "payment_history", "data_usage_gb", "upgrade_count", "churn_risk_score"],
          algorithms: ["Gradient Boosting", "Linear Regression", "Survival Analysis"],
          edaHighlights: ["CLV distribution is right-skewed (top 20% = 64% of value)", "Tenure is non-linearly related to CLV", "Bundle count doubles CLV vs single-product"],
        },
      },
      {
        id: "fraud-detection-tmt",
        name: "Fraud Detection",
        shortName: "Fraud & Abuse Intelligence",
        description: "Real-time fraud scoring for SIM swap, subscription fraud and payment abuse using behavioral and network signals.",
        tag: "Risk",
        kpis: [
          { label: "Fraud Loss Rate", value: "0.12%", trend: "↓ 0.04pp vs prior", up: true, color: "green" },
          { label: "Detection Accuracy", value: "94.2%", trend: "↑ 2.1pp post-retraining", up: true, color: "green" },
          { label: "False Positive Rate", value: "3.1%", trend: "Target <2.5%", up: false, color: "amber" },
          { label: "Cases Resolved", value: "87%", trend: "Within 24-hr SLA", up: true, color: "blue" },
        ],
        businessTabs: [
          {
            label: "Fraud Patterns",
            description: "Fraud case distribution by type and channel",
            chartType: "bar",
            chartData: barData(["SIM Swap", "Subscription Fraud", "Payment Abuse", "Account Takeover", "Internal"], [38, 28, 18, 12, 4], "pct"),
            insightRows: [
              { label: "Top Fraud Type", value: "SIM Swap – 38% of cases" },
              { label: "Fastest Growing", value: "Account Takeover (+8pp YoY)" },
              { label: "Average Fraud Loss", value: "$2,840 per confirmed case" },
              { label: "Detection Lag (SIM Swap)", value: "Avg 4.2 hours from initiation" },
            ],
          },
          {
            label: "Risk Scoring",
            description: "Real-time fraud score distribution",
            chartType: "bar",
            chartData: barData(["Score <0.1", "0.1–0.3", "0.3–0.5", "0.5–0.7", ">0.7"], [64, 18, 8, 6, 4], "pct"),
            insightRows: [
              { label: "High-Risk Events (>0.7)", value: "4% of flagged events" },
              { label: "Auto-Blocked Rate", value: "2.1% of all transactions" },
              { label: "Model Precision@0.7", value: "0.84 (low false positives)" },
              { label: "Review Queue Size", value: "240 pending manual review" },
            ],
          },
          {
            label: "Case Management",
            description: "Case resolution pipeline and aging",
            chartType: "bar",
            chartData: barData(["Resolved <4hr", "4–24hr", "1–3 days", "3–7 days", ">7 days"], [52, 28, 12, 6, 2], "pct"),
            insightRows: [
              { label: "Avg Resolution Time", value: "6.4 hours" },
              { label: "Auto-Resolution Rate", value: "62% (no human required)" },
              { label: "Escalation Rate", value: "8% escalated to Law Enforcement" },
              { label: "Recovery Rate", value: "34% of fraud losses recovered" },
            ],
          },
          {
            label: "Rules Engine",
            description: "Rule performance – hit rate and precision",
            chartType: "bar",
            chartData: barData(["Rule 1", "Rule 2", "Rule 3", "Rule 4", "ML Score"], [84, 72, 68, 54, 94], "precision"),
            insightRows: [
              { label: "Active Rules", value: "142 live rules" },
              { label: "Rules Sunset This Quarter", value: "8 rules (low precision)" },
              { label: "ML vs Rules Precision Gap", value: "ML +10pp precision advantage" },
              { label: "Recommended", value: "Migrate 4 rules to ML scoring" },
            ],
          },
        ],
        orionContext: {
          targetVariable: "is_fraud",
          features: ["velocity_24hr", "device_fingerprint_change", "sim_swap_flag", "payment_method_change", "location_anomaly", "call_pattern_deviation", "account_age", "credit_score"],
          algorithms: ["Gradient Boosting", "Isolation Forest", "Neural Network", "Logistic Regression"],
          edaHighlights: ["Velocity features are top predictors", "SIM swap flag has 0.82 precision for fraud", "Account age <30 days shows 8× fraud rate"],
        },
      },
    ],
  },

  {
    id: "bfsi",
    name: "BFSI",
    fullName: "Banking, Financial Services & Insurance",
    description: "Credit intelligence, risk analytics & customer value optimization",
    color: "#a855f7",
    accent: "purple",
    useCases: [
      {
        id: "credit-risk",
        name: "Credit Risk Scoring",
        shortName: "Credit Risk Intelligence",
        description: "PD/LGD modeling and portfolio risk analytics to optimize credit decisioning and minimize expected loss.",
        tag: "Risk",
        kpis: [
          { label: "Gini Score", value: "0.68", trend: "↑ 0.04 vs scorecard", up: true, color: "green" },
          { label: "Portfolio Default Rate", value: "2.1%", trend: "↓ 0.3pp YoY", up: true, color: "green" },
          { label: "Portfolio at Risk", value: "$48M", trend: "↑ $4M vs last quarter", up: false, color: "red" },
          { label: "Approval Rate", value: "64%", trend: "Target 68% with same risk", up: false, color: "amber" },
        ],
        businessTabs: [
          {
            label: "Risk Distribution",
            description: "Portfolio segmentation by risk score band",
            chartType: "bar",
            chartData: barData(["AAA", "AA", "A", "BBB", "BB", "B", "CCC+"], [8, 14, 22, 24, 18, 10, 4], "portfolio_pct"),
            insightRows: [
              { label: "Investment Grade %", value: "68% of portfolio (AAA–BBB)" },
              { label: "High-Risk Concentration", value: "14% in BB/B/CCC (↑ 2pp)" },
              { label: "Expected Loss (1yr)", value: "$12.4M (provisioned)" },
              { label: "Unexpected Loss (99% VaR)", value: "$38M capital allocation" },
            ],
          },
          {
            label: "Segment Analysis",
            description: "Default rate and approval rate by customer segment",
            chartType: "bar",
            chartData: barData(["Prime", "Near-Prime", "Sub-Prime", "New-to-Credit", "SME"], [0.8, 2.4, 6.8, 4.2, 3.1], "default_rate"),
            insightRows: [
              { label: "Lowest Default Rate", value: "Prime – 0.8%" },
              { label: "Highest Risk", value: "Sub-Prime – 6.8% default" },
              { label: "Fastest Growing Segment", value: "New-to-Credit (+18% applications)" },
              { label: "Model Gap", value: "New-to-Credit: thin file challenge" },
            ],
          },
          {
            label: "Vintage Analysis",
            description: "Default rate by origination vintage and months on book",
            chartType: "line",
            chartData: months.map((m, i) => ({ name: m, vintage_2022: 1.2 + i * 0.08, vintage_2023: 1.8 + i * 0.06, vintage_2024: 2.1 + i * 0.05 })),
            insightRows: [
              { label: "Best Vintage", value: "2022 originations – lowest cumulative loss" },
              { label: "Most Concerning", value: "2024 vintage – elevated early delinquency" },
              { label: "Cure Rate", value: "42% of 30-DPD cure within 60 days" },
              { label: "Provisioning Adjustment", value: "+$4.2M recommended for 2024 vintage" },
            ],
          },
          {
            label: "Stress Testing",
            description: "Portfolio loss under adverse macroeconomic scenarios",
            chartType: "bar",
            chartData: barData(["Base Case", "Moderate Stress", "Severe Stress", "Extreme Stress"], [12.4, 24.8, 48.2, 84.6], "expected_loss_M"),
            insightRows: [
              { label: "Base Case Loss", value: "$12.4M (current provision)" },
              { label: "Severe Stress Loss", value: "$48.2M (capital buffer adequate)" },
              { label: "Capital Adequacy Ratio", value: "14.2% (regulatory min 10.5%)" },
              { label: "Scenario Trigger", value: "Unemployment >8% or Rate >7%" },
            ],
          },
        ],
        orionContext: {
          targetVariable: "probability_of_default",
          features: ["credit_score", "debt_to_income", "employment_status", "loan_to_value", "payment_history_24m", "utilization_rate", "inquiries_6m", "account_age"],
          algorithms: ["Logistic Regression", "Gradient Boosting", "Neural Network", "Scorecard"],
          edaHighlights: ["Payment history is top predictor (30% importance)", "Utilization rate shows non-linear relationship with default", "Income verification reduces Gini by 0.04 when missing"],
        },
      },
      {
        id: "banking-churn",
        name: "Customer Churn (Banking)",
        shortName: "Banking Attrition Analytics",
        description: "Deposit attrition prediction and relationship banking churn modeling to protect revenue from high-value customers.",
        tag: "Retention",
        kpis: [
          { label: "Attrition Rate", value: "8.4%", trend: "↑ 0.8pp YoY", up: false, color: "red" },
          { label: "NPS", value: "28", trend: "↓ 3 pts vs prior", up: false, color: "amber" },
          { label: "Deposit Outflow", value: "$120M", trend: "↑ $18M vs last year", up: false, color: "red" },
          { label: "Re-engagement Rate", value: "34%", trend: "↑ 4pp with new campaign", up: true, color: "green" },
        ],
        businessTabs: [
          {
            label: "Churn Diagnostics",
            description: "Attrition drivers and segment breakdown",
            chartType: "bar",
            chartData: barData(["Better Rate Offer", "Service Issues", "Life Event", "Digital Experience", "Fee Sensitivity"], [34, 24, 18, 14, 10], "pct"),
            insightRows: [
              { label: "Top Churn Driver", value: "Better rate from competitor (34%)" },
              { label: "Avoidable Churn %", value: "62% addressable with intervention" },
              { label: "High-Value Attrition", value: "$120M deposits at risk (next 90d)" },
              { label: "Model AUC", value: "0.78 (current model)" },
            ],
          },
          {
            label: "Early Warning",
            description: "Behavioral signals predictive of attrition 60–90 days ahead",
            chartType: "bar",
            chartData: barData(["Login Frequency Drop", "Balance Decline", "Product Reduction", "Competitor Inquiry", "Complaint Filed"], [72, 68, 64, 82, 88], "signal_strength"),
            insightRows: [
              { label: "Strongest Early Signal", value: "Complaint filed (88% predictive)" },
              { label: "Digital Disengagement", value: "Login drop 60+ days = 3× churn risk" },
              { label: "Balance Outflow Pattern", value: ">20% balance transfer → 72% churn" },
              { label: "Lead Time of Signals", value: "Avg 68 days before attrition" },
            ],
          },
          {
            label: "Retention Queue",
            description: "Prioritized intervention list by CLV and churn risk",
            chartType: "bar",
            chartData: barData(["Immediate Action", "High Priority", "Medium Priority", "Watch List", "Stable"], [4, 12, 24, 28, 32], "pct"),
            insightRows: [
              { label: "Immediate Action Count", value: "1,240 customers (CLV >$50K)" },
              { label: "Avg Deposit at Risk", value: "$84K per immediate action" },
              { label: "Recommended Offer", value: "Rate match + RM outreach" },
              { label: "Campaign Conversion Target", value: "42% save rate" },
            ],
          },
          {
            label: "Value Protection",
            description: "Revenue protected by intervention type and CLV tier",
            chartType: "bar",
            chartData: barData(["Rate Match", "Fee Waiver", "Digital Upgrade", "RM Engagement", "Bundle Offer"], [42, 28, 18, 62, 34], "save_rate"),
            insightRows: [
              { label: "Most Effective Intervention", value: "RM Personal Engagement (62%)" },
              { label: "Cost per Save", value: "Avg $240 per retained customer" },
              { label: "ROI of Retention Program", value: "8.4× on intervention cost" },
              { label: "Revenue Protected (YTD)", value: "$42M deposits retained" },
            ],
          },
        ],
        orionContext: {
          targetVariable: "churn_probability_90d",
          features: ["login_frequency_delta", "balance_trend_60d", "product_count", "complaint_flag", "nps_score", "tenure_years", "digital_engagement_score", "competitor_inquiry"],
          algorithms: ["Gradient Boosting", "Logistic Regression", "Random Forest", "Neural Network"],
          edaHighlights: ["Complaint filed is the strongest single predictor", "Balance decline >20% in 60 days signals imminent churn", "Digital engagement score separates at-risk from stable"],
        },
      },
      {
        id: "fraud-detection-bfsi",
        name: "Fraud Detection",
        shortName: "Transaction Fraud Analytics",
        description: "Real-time transaction fraud scoring and account takeover prevention using ML behavioral models.",
        tag: "Risk",
        kpis: [
          { label: "Detection Rate", value: "96.8%", trend: "↑ 1.4pp post-upgrade", up: true, color: "green" },
          { label: "False Positive Rate", value: "2.4%", trend: "↓ 0.8pp vs baseline", up: true, color: "green" },
          { label: "Fraud Loss", value: "$8.4M", trend: "↓ $1.2M YoY", up: true, color: "amber" },
          { label: "Resolution Time", value: "2.1 days", trend: "↓ 0.4 days MoM", up: true, color: "blue" },
        ],
        businessTabs: [
          {
            label: "Transaction Monitoring",
            description: "Real-time alert volume and fraud conversion rate",
            chartType: "line",
            chartData: months.map((m, i) => ({ name: m, alerts: Math.round(1200 - i * 40 + Math.random() * 80), confirmed_fraud: Math.round(48 - i * 1.5 + Math.random() * 8) })),
            insightRows: [
              { label: "Daily Transaction Volume", value: "2.4M transactions/day" },
              { label: "Alert Rate", value: "0.8% (↓ from 1.2%)" },
              { label: "Alert-to-Fraud Conversion", value: "4.1% of alerts confirmed" },
              { label: "Average Fraud Amount", value: "$1,840 per confirmed case" },
            ],
          },
          {
            label: "Pattern Analysis",
            description: "Fraud type breakdown and trend",
            chartType: "bar",
            chartData: barData(["Card Not Present", "Account Takeover", "Synthetic Identity", "First-Party Fraud", "Wire Transfer"], [42, 28, 14, 10, 6], "pct"),
            insightRows: [
              { label: "Top Fraud Type", value: "Card Not Present – 42%" },
              { label: "Fastest Growing", value: "Synthetic Identity (+12pp YoY)" },
              { label: "Highest Loss per Case", value: "Wire Transfer – $42K avg" },
              { label: "Geographic Hotspot", value: "Urban centers – 3× fraud rate" },
            ],
          },
          {
            label: "Case Management",
            description: "Case pipeline status and resolution SLA",
            chartType: "bar",
            chartData: barData(["Auto-Resolved", "Agent Review", "Investigation", "Law Enforcement", "Recovery"], [52, 28, 14, 4, 2], "pct"),
            insightRows: [
              { label: "Auto-Resolution Rate", value: "52% (no human required)" },
              { label: "Open Case Queue", value: "840 active cases" },
              { label: "Avg Case Age", value: "2.1 days (↓ 0.4 vs prior)" },
              { label: "Recovery Rate", value: "34% of confirmed losses" },
            ],
          },
          {
            label: "Rules Engine",
            description: "ML model vs rule performance comparison",
            chartType: "bar",
            chartData: barData(["ML Model", "Rule Set A", "Rule Set B", "Combined"], [96.8, 84.2, 78.4, 97.2], "detection_rate"),
            insightRows: [
              { label: "ML Model Precision", value: "0.89 (vs 0.72 rules-only)" },
              { label: "Rules Complementing ML", value: "8 rules add incremental value" },
              { label: "Rules Redundant to ML", value: "34 rules (sunset candidates)" },
              { label: "Combined System AUC", value: "0.94 (best performance)" },
            ],
          },
        ],
        orionContext: {
          targetVariable: "is_fraud",
          features: ["transaction_amount", "merchant_category", "velocity_1hr", "location_mismatch", "device_change", "time_of_day", "account_age", "behavioral_score"],
          algorithms: ["Gradient Boosting", "Neural Network", "Isolation Forest", "Logistic Regression"],
          edaHighlights: ["Velocity features are most predictive", "Transaction amount >$2K and merchant mismatch flags 8× fraud rate", "Weekend transactions show elevated risk"],
        },
      },
      {
        id: "cross-sell",
        name: "Cross-sell Intelligence",
        shortName: "Next Best Product",
        description: "AI-powered next-best-product recommendations and propensity scoring to grow wallet share per customer.",
        tag: "Revenue",
        kpis: [
          { label: "Cross-sell Rate", value: "18.4%", trend: "↑ 3.2pp vs prior model", up: true, color: "green" },
          { label: "Revenue per Customer", value: "+$340", trend: "↑ $48 vs prior year", up: true, color: "green" },
          { label: "Products per Customer", value: "2.8", trend: "Target 3.5 by year end", up: false, color: "amber" },
          { label: "Campaign Conversion", value: "12%", trend: "↑ 2.8pp with AI recs", up: true, color: "green" },
        ],
        businessTabs: [
          {
            label: "Propensity Scoring",
            description: "Customer propensity scores by product category",
            chartType: "bar",
            chartData: barData(["Wealth Mgmt", "Mortgage", "Insurance", "Credit Card", "Investment"], [24, 18, 32, 42, 14], "propensity_pct"),
            insightRows: [
              { label: "Highest Propensity Product", value: "Credit Card – 42% eligible" },
              { label: "Best Cross-sell Timing", value: "Life event trigger (marriage, home)" },
              { label: "AI Lift vs Random", value: "3.2× conversion vs untargeted" },
              { label: "High-Value Opportunity", value: "Wealth Mgmt – $4,200 avg revenue" },
            ],
          },
          {
            label: "Product Affinity",
            description: "Product co-ownership matrix and pair lift",
            chartType: "bar",
            chartData: barData(["Current Acct→Savings", "Savings→Investment", "CC→Insurance", "Mortgage→HE Loan", "Inv→Wealth"], [3.8, 2.9, 2.4, 4.2, 3.1], "lift"),
            insightRows: [
              { label: "Strongest Affinity", value: "Mortgage → Home Equity (4.2 lift)" },
              { label: "Digital-Triggered Pair", value: "Savings → Investment (app prompt)" },
              { label: "Revenue per Pair Upgrade", value: "+$480/customer avg" },
              { label: "Bundle Discount Strategy", value: "2% rate discount drives 28% uptake" },
            ],
          },
          {
            label: "Offer Optimization",
            description: "Offer performance by channel and customer segment",
            chartType: "bar",
            chartData: barData(["Digital App", "Email", "Branch", "Call Center", "ATM"], [18, 12, 28, 22, 8], "conversion_pct"),
            insightRows: [
              { label: "Highest Conversion Channel", value: "Branch (28% – high trust)" },
              { label: "Best Digital Channel", value: "In-App (18% – lowest cost)" },
              { label: "Cost per Acquisition", value: "App: $24, Branch: $142" },
              { label: "Optimal Channel Mix", value: "App primary, Branch confirm" },
            ],
          },
          {
            label: "Channel Mix",
            description: "Revenue contribution by channel and campaign type",
            chartType: "bar",
            chartData: barData(["Digital", "Branch", "Call Center", "Email", "ATM"], [42, 28, 18, 8, 4], "revenue_pct"),
            insightRows: [
              { label: "Digital Revenue Share", value: "42% (↑ 8pp YoY)" },
              { label: "Branch Still Critical", value: "28% – complex products" },
              { label: "Shift Opportunity", value: "8% CC → digital saves $2.4M" },
              { label: "Omnichannel Customers", value: "2.4× revenue vs single-channel" },
            ],
          },
        ],
        orionContext: {
          targetVariable: "next_product_category",
          features: ["current_product_count", "balance_tier", "age_band", "life_event_flag", "digital_engagement", "tenure_years", "income_band", "credit_score"],
          algorithms: ["Collaborative Filtering", "Gradient Boosting", "Logistic Regression", "Neural Network"],
          edaHighlights: ["Life event flags drive 3× propensity", "Product count and tenure highly correlated with cross-sell success", "Digital-only customers show lower branch product uptake"],
        },
      },
      {
        id: "claims-prediction",
        name: "Claims Prediction",
        shortName: "Claims & Fraud Intelligence",
        description: "Claim frequency and severity prediction to optimize reserving, identify fraud and improve claims processing efficiency.",
        tag: "Insurance",
        kpis: [
          { label: "Claims Loss Ratio", value: "84%", trend: "↓ 2pp vs prior year", up: true, color: "green" },
          { label: "Predicted vs Actual Δ", value: "±3.2%", trend: "Model accuracy on reserves", up: true, color: "blue" },
          { label: "Fraud Claims %", value: "4.8%", trend: "↑ 0.4pp (new fraud pattern)", up: false, color: "red" },
          { label: "Processing Time", value: "4.2 days", trend: "↓ 1.1 days with AI triage", up: true, color: "green" },
        ],
        businessTabs: [
          {
            label: "Claims Analytics",
            description: "Claim volume and cost trend by line of business",
            chartType: "line",
            chartData: months.map((m, i) => ({ name: m, claims: Math.round(2400 + i * 40 + Math.random() * 120), cost_K: Math.round(4800 + i * 60 + Math.random() * 200) })),
            insightRows: [
              { label: "Monthly Claims Volume", value: "2,840 (↑ 4.2% MoM)" },
              { label: "Avg Claim Cost", value: "$1,690 (all lines)" },
              { label: "Catastrophic Claims (>$50K)", value: "2.4% of claims, 38% of cost" },
              { label: "Reopened Claims Rate", value: "8.4% (industry avg 11%)" },
            ],
          },
          {
            label: "Fraud Scoring",
            description: "Fraud propensity score distribution for incoming claims",
            chartType: "bar",
            chartData: barData(["<0.1", "0.1–0.3", "0.3–0.5", "0.5–0.7", ">0.7"], [58, 22, 10, 6, 4], "pct_of_claims"),
            insightRows: [
              { label: "High-Fraud Risk Claims", value: "4% (score >0.7) – $8.4M exposure" },
              { label: "Model Precision at 0.7", value: "0.82 (confirmed fraud rate)" },
              { label: "SIU Referral Rate", value: "2.1% of claims referred" },
              { label: "Fraud Savings YTD", value: "$3.2M prevented losses" },
            ],
          },
          {
            label: "Severity Modeling",
            description: "Predicted vs actual claim severity by category",
            chartType: "bar",
            chartData: barData(["Property", "Auto", "Liability", "Health", "Life"], [4200, 1840, 8400, 2100, 42000], "avg_severity"),
            insightRows: [
              { label: "Highest Severity", value: "Life – avg $42K per claim" },
              { label: "Highest Volume", value: "Auto – 42% of all claims" },
              { label: "Severity Model R²", value: "0.74 (Gradient Boosting)" },
              { label: "Reserve Adequacy", value: "97.2% (IBNR provision ok)" },
            ],
          },
          {
            label: "Reserve Management",
            description: "Reserve development and IBNR estimation",
            chartType: "bar",
            chartData: quarters.map((q, i) => ({ name: q, reserve: [48, 52, 56, 58, 54, 50][i], ibnr: [12, 14, 16, 15, 13, 12][i] })),
            insightRows: [
              { label: "Total Claims Reserve", value: "$58M current period" },
              { label: "IBNR Estimate", value: "$15M (AI-assisted calculation)" },
              { label: "Reserve Run-Off Rate", value: "3.2% favorable development" },
              { label: "Model Improvement vs Actuarial", value: "±1.8% vs ±4.2% manual" },
            ],
          },
        ],
        orionContext: {
          targetVariable: "claim_severity_usd",
          features: ["policy_type", "coverage_amount", "claim_history_3yr", "vehicle_age", "location_risk_score", "weather_event_flag", "claimant_history", "attorney_flag"],
          algorithms: ["Gradient Boosting", "GLM (Tweedie)", "Random Forest", "Neural Network"],
          edaHighlights: ["Attorney involvement is strongest severity predictor", "Weather events drive catastrophic claim spikes", "Prior claim history shows non-linear severity relationship"],
        },
      },
    ],
  },
];

export function getIndustry(id: string): IndustryDef | undefined {
  return INDUSTRIES.find(i => i.id === id);
}

export function getUseCase(industryId: string, useCaseId: string): UseCaseDef | undefined {
  return getIndustry(industryId)?.useCases.find(u => u.id === useCaseId);
}
