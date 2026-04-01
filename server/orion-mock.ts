// ML Orion — Decision Model Factory — Synthetic Mock Data

export const modelPortfolioData = {
  kpis: {
    totalModels: 12,
    inProduction: 5,
    needRetraining: 3,
    withAlerts: 2,
    avgHealthScore: 81,
  },
  models: [
    { id: "m1", name: "Churn Risk v3.2", type: "Classification", useCase: "Customer Churn", version: "v3.2", status: "Production", metric: "AUC 0.84", lastTrained: "2026-03-10", owner: "DS Team", health: 88, driftAlert: false, region: "All" },
    { id: "m2", name: "Driver Attribution v2.1", type: "Multi-class", useCase: "Churn Reason", version: "v2.1", status: "Production", metric: "F1 0.71", lastTrained: "2026-03-08", owner: "DS Team", health: 76, driftAlert: true, region: "All" },
    { id: "m3", name: "Next Best Action v1.4", type: "Recommendation", useCase: "Next Best Action", version: "v1.4", status: "Pilot", metric: "Precision@3 0.68", lastTrained: "2026-03-06", owner: "DS Team", health: 72, driftAlert: false, region: "North" },
    { id: "m4", name: "Revenue-at-Risk v1.0", type: "Regression", useCase: "Revenue Impact", version: "v1.0", status: "Production", metric: "RMSE $42", lastTrained: "2026-03-01", owner: "Analytics", health: 85, driftAlert: false, region: "All" },
    { id: "m5", name: "Save Probability v2.0", type: "Classification", useCase: "Retention", version: "v2.0", status: "Production", metric: "AUC 0.79", lastTrained: "2026-02-28", owner: "DS Team", health: 80, driftAlert: false, region: "All" },
    { id: "m6", name: "Migration Propensity v1.2", type: "Classification", useCase: "Fiber Migration", version: "v1.2", status: "Production", metric: "AUC 0.77", lastTrained: "2026-02-25", owner: "Strategy", health: 78, driftAlert: true, region: "South" },
    { id: "m7", name: "Anomaly Early Warning v1.0", type: "Anomaly Detection", useCase: "Early Warning", version: "v1.0", status: "Training", metric: "Precision 0.74", lastTrained: "2026-02-20", owner: "DS Team", health: 65, driftAlert: false, region: "All" },
    { id: "m8", name: "Uplift Treatment v1.1", type: "Uplift", useCase: "Retention Uplift", version: "v1.1", status: "Validation", metric: "AUUC 0.61", lastTrained: "2026-02-18", owner: "DS Team", health: 70, driftAlert: false, region: "All" },
    { id: "m9", name: "Customer LTV v1.0", type: "Regression", useCase: "Lifetime Value", version: "v1.0", status: "Archived", metric: "R² 0.69", lastTrained: "2026-01-15", owner: "Analytics", health: 55, driftAlert: false, region: "All" },
    { id: "m10", name: "Offer Optimization v0.9", type: "Optimization", useCase: "Offer Design", version: "v0.9", status: "Draft", metric: "TBD", lastTrained: "N/A", owner: "DS Team", health: 40, driftAlert: false, region: "All" },
    { id: "m11", name: "Segment Churn v1.3", type: "Classification", useCase: "Segment Churn", version: "v1.3", status: "Production", metric: "AUC 0.81", lastTrained: "2026-03-05", owner: "DS Team", health: 83, driftAlert: false, region: "All" },
    { id: "m12", name: "Service Quality Risk v1.0", type: "Classification", useCase: "Service Failure", version: "v1.0", status: "Pilot", metric: "F1 0.66", lastTrained: "2026-02-22", owner: "Network", health: 68, driftAlert: false, region: "West" },
  ],
};

export const useCasePipelineData = {
  stages: ["Draft", "Data Ready", "Training", "Validated", "Approved", "Live"],
  useCases: [
    { id: "uc1", title: "Predict Copper Churn Risk", objective: "Identify customers likely to churn in next 90 days", stage: "Live", dataset: "Customer 360 v4", features: 47, model: "Churn Risk v3.2", kpi: "AUC 0.84", priority: "High", owner: "DS Team" },
    { id: "uc2", title: "Classify Churn Driver", objective: "Identify primary reason behind churn decision", stage: "Live", dataset: "Customer 360 v4", features: 31, model: "Driver Attribution v2.1", kpi: "F1 0.71", priority: "High", owner: "DS Team" },
    { id: "uc3", title: "Recommend Next Best Action", objective: "Suggest optimal retention action per customer", stage: "Approved", dataset: "Action History v2", features: 38, model: "Next Best Action v1.4", kpi: "Precision@3 0.68", priority: "High", owner: "Product" },
    { id: "uc4", title: "Predict Save Success", objective: "Estimate probability of successful retention", stage: "Live", dataset: "Retention Outcomes v3", features: 22, model: "Save Probability v2.0", kpi: "AUC 0.79", priority: "Medium", owner: "DS Team" },
    { id: "uc5", title: "Estimate Revenue at Risk", objective: "Quantify MRR exposed to churn by segment", stage: "Live", dataset: "Billing + Risk v2", features: 18, model: "Revenue-at-Risk v1.0", kpi: "RMSE $42", priority: "High", owner: "Finance" },
    { id: "uc6", title: "Predict Migration Propensity", objective: "Score likelihood of copper→fiber migration", stage: "Live", dataset: "Network + CRM v3", features: 29, model: "Migration Propensity v1.2", kpi: "AUC 0.77", priority: "Medium", owner: "Strategy" },
    { id: "uc7", title: "Early Warning Signal Detection", objective: "Flag at-risk accounts before intent emerges", stage: "Training", dataset: "Signals v1", features: 41, model: "Anomaly Early Warning v1.0", kpi: "Precision 0.74", priority: "High", owner: "DS Team" },
    { id: "uc8", title: "Retention Uplift Modelling", objective: "Estimate incremental save probability by treatment", stage: "Validated", dataset: "A/B Experiment v1", features: 26, model: "Uplift Treatment v1.1", kpi: "AUUC 0.61", priority: "Medium", owner: "DS Team" },
    { id: "uc9", title: "Customer Lifetime Value", objective: "Rank customers by long-term revenue potential", stage: "Draft", dataset: "Billing History v5", features: 15, model: "Customer LTV v1.0", kpi: "R² 0.69", priority: "Low", owner: "Analytics" },
    { id: "uc10", title: "Offer Optimization", objective: "Select best discount/offer to maximise save rate", stage: "Data Ready", dataset: "Offer Response v1", features: 12, model: "Offer Optimization v0.9", kpi: "TBD", priority: "Medium", owner: "Marketing" },
  ],
};

export const dataOnboardingStatus = {
  recentUploads: [
    { id: "u1", name: "customer_360_march.csv", rows: 48200, cols: 23, size: "4.2 MB", uploadedAt: "2026-03-10 09:15", status: "Processed", mode: "File Upload" },
    { id: "u2", name: "billing_q1_2026.csv", rows: 51400, cols: 18, size: "5.8 MB", uploadedAt: "2026-03-09 14:30", status: "Processed", mode: "File Upload" },
    { id: "u3", name: "Network Events Feed", rows: 220000, cols: 12, size: "Live", uploadedAt: "2026-03-12 08:00", status: "Active", mode: "Live Connection" },
    { id: "u4", name: "CRM DB Import", rows: 48200, cols: 31, size: "DB Query", uploadedAt: "2026-03-11 22:00", status: "Processed", mode: "Database Import" },
  ],
  databaseConnections: [
    { id: "db1", name: "CRM PostgreSQL", host: "crm-prod.internal", db: "customers", status: "Connected", lastSync: "2026-03-12 06:00", tables: 14 },
    { id: "db2", name: "Billing Oracle", host: "billing.internal", db: "billing_v2", status: "Connected", lastSync: "2026-03-12 03:00", tables: 8 },
    { id: "db3", name: "Network InfluxDB", host: "network.internal", db: "telemetry", status: "Error", lastSync: "2026-03-11 18:00", tables: 3 },
  ],
  liveConnections: [
    { id: "lc1", name: "Kafka Event Stream", type: "Kafka", topic: "customer-events", status: "Active", rate: "1,240 msg/min", latency: "120ms" },
    { id: "lc2", name: "REST API Feed", type: "REST API", endpoint: "/api/signals/v2", status: "Active", rate: "340 req/min", latency: "85ms" },
  ],
};

export const dataAssetsRegistry = {
  datasets: [
    { id: "ds1", name: "Customer 360 v4", type: "Master", rows: 48200, cols: 47, owner: "DS Team", refreshFreq: "Daily", lastRefresh: "2026-03-12", usedInModels: 5, qualityScore: 94, status: "Active", tags: ["CRM", "Billing", "Usage"] },
    { id: "ds2", name: "Billing History v5", type: "Transactional", rows: 512000, cols: 18, owner: "Finance", refreshFreq: "Daily", lastRefresh: "2026-03-12", usedInModels: 3, qualityScore: 97, status: "Active", tags: ["Billing"] },
    { id: "ds3", name: "Action History v2", type: "Operational", rows: 24800, cols: 22, owner: "Retention", refreshFreq: "Hourly", lastRefresh: "2026-03-12", usedInModels: 2, qualityScore: 88, status: "Active", tags: ["Actions", "Outcomes"] },
    { id: "ds4", name: "Network Quality v3", type: "Technical", rows: 980000, cols: 12, owner: "Network", refreshFreq: "Real-time", lastRefresh: "2026-03-12", usedInModels: 2, qualityScore: 91, status: "Active", tags: ["Network", "Quality"] },
    { id: "ds5", name: "Retention Outcomes v3", type: "Outcomes", rows: 18400, cols: 15, owner: "DS Team", refreshFreq: "Weekly", lastRefresh: "2026-03-10", usedInModels: 3, qualityScore: 96, status: "Active", tags: ["Retention", "Labels"] },
    { id: "ds6", name: "Competitor Fiber Map v2", type: "External", rows: 4200, cols: 8, owner: "Strategy", refreshFreq: "Monthly", lastRefresh: "2026-03-01", usedInModels: 1, qualityScore: 78, status: "Stale", tags: ["External", "Competition"] },
    { id: "ds7", name: "Offer Response v1", type: "Experimental", rows: 8600, cols: 11, owner: "Marketing", refreshFreq: "Weekly", lastRefresh: "2026-03-08", usedInModels: 1, qualityScore: 82, status: "Active", tags: ["Offers", "A/B"] },
    { id: "ds8", name: "Signals v1", type: "Derived", rows: 48200, cols: 41, owner: "DS Team", refreshFreq: "Daily", lastRefresh: "2026-03-11", usedInModels: 1, qualityScore: 85, status: "Active", tags: ["Signals", "Features"] },
  ],
  featureCatalog: [
    { id: "f1", name: "tenure_months", category: "Lifecycle", description: "Customer tenure in months", usedIn: 6, driftStatus: "Stable", importance: 0.92 },
    { id: "f2", name: "monthly_charges", category: "Billing", description: "Monthly billing amount", usedIn: 5, driftStatus: "Stable", importance: 0.87 },
    { id: "f3", name: "tickets_last_90d", category: "Service Quality", description: "Support tickets in past 90 days", usedIn: 4, driftStatus: "Stable", importance: 0.81 },
    { id: "f4", name: "usage_drop_3m", category: "Usage", description: "% decline in usage over 3 months", usedIn: 5, driftStatus: "Drifting", importance: 0.78 },
    { id: "f5", name: "fiber_presence_flag", category: "Competition", description: "Fiber competitor available in area", usedIn: 3, driftStatus: "Stable", importance: 0.75 },
    { id: "f6", name: "price_shock_pct", category: "Billing", description: "Price increase % in last billing cycle", usedIn: 4, driftStatus: "Stable", importance: 0.73 },
    { id: "f7", name: "promo_expiry_60d", category: "Billing", description: "Promotion expiring within 60 days flag", usedIn: 3, driftStatus: "Stable", importance: 0.71 },
    { id: "f8", name: "nps_score", category: "Customer Profile", description: "Net Promoter Score", usedIn: 2, driftStatus: "Stale", importance: 0.66 },
    { id: "f9", name: "outage_hours_30d", category: "Network", description: "Total outage hours in last 30 days", usedIn: 3, driftStatus: "Drifting", importance: 0.64 },
    { id: "f10", name: "contract_end_90d", category: "Contract", description: "Contract ending within 90 days", usedIn: 4, driftStatus: "Stable", importance: 0.69 },
  ],
};

export const dataQualityData = {
  summary: { overallScore: 87, datasetsChecked: 8, issuesFound: 12, criticalIssues: 2, lastRun: "2026-03-12 08:00" },
  checks: [
    { dataset: "Customer 360 v4", check: "Missingness", score: 96, status: "Pass", detail: "0.4% missing across 47 cols" },
    { dataset: "Customer 360 v4", check: "Freshness", score: 99, status: "Pass", detail: "Updated 2h ago" },
    { dataset: "Customer 360 v4", check: "Class Balance", score: 88, status: "Warning", detail: "Churn rate 18.2% — slight imbalance" },
    { dataset: "Customer 360 v4", check: "Schema Drift", score: 100, status: "Pass", detail: "No schema changes" },
    { dataset: "Customer 360 v4", check: "Leakage Risk", score: 95, status: "Pass", detail: "No temporal leakage detected" },
    { dataset: "Billing History v5", check: "Missingness", score: 99, status: "Pass", detail: "0.1% missing" },
    { dataset: "Billing History v5", check: "Outliers", score: 82, status: "Warning", detail: "14 extreme charge values" },
    { dataset: "Network Quality v3", check: "Freshness", score: 100, status: "Pass", detail: "Real-time feed" },
    { dataset: "Network Quality v3", check: "Missingness", score: 74, status: "Fail", detail: "26% missing in outage_duration" },
    { dataset: "Competitor Fiber Map v2", check: "Freshness", score: 42, status: "Fail", detail: "Last refresh 11 days ago" },
    { dataset: "Action History v2", check: "Class Balance", score: 91, status: "Pass", detail: "Balanced outcome labels" },
    { dataset: "Signals v1", check: "Leakage Risk", score: 78, status: "Warning", detail: "3 features require temporal review" },
  ],
  profileStats: {
    totalRows: 48200,
    totalFeatures: 47,
    missingnessAvg: 2.3,
    classImbalanceRatio: 4.49,
    duplicateRows: 0,
    outlierCells: 14,
  },
};

export const edaData = {
  summary: { rows: 48200, cols: 47, churnRate: 18.2, avgTenure: 34.8, avgMRC: 94.5 },
  churnByTenure: [
    { bucket: "0-6m", churnRate: 31.2, count: 4820 },
    { bucket: "7-12m", churnRate: 24.8, count: 6240 },
    { bucket: "13-24m", churnRate: 18.6, count: 9640 },
    { bucket: "25-36m", churnRate: 14.2, count: 8420 },
    { bucket: "37-60m", churnRate: 11.8, count: 10880 },
    { bucket: "60m+", churnRate: 8.4, count: 8200 },
  ],
  churnByMRC: [
    { bucket: "<$50", churnRate: 22.4, count: 8200 },
    { bucket: "$50-$75", churnRate: 19.8, count: 12400 },
    { bucket: "$75-$100", churnRate: 16.2, count: 14600 },
    { bucket: "$100-$150", churnRate: 14.4, count: 8400 },
    { bucket: "$150+", churnRate: 11.8, count: 4600 },
  ],
  correlations: [
    { feature: "tenure_months", correlation: -0.42 },
    { feature: "tickets_last_90d", correlation: 0.38 },
    { feature: "usage_drop_3m", correlation: 0.36 },
    { feature: "price_shock_pct", correlation: 0.31 },
    { feature: "fiber_presence_flag", correlation: 0.29 },
    { feature: "promo_expiry_60d", correlation: 0.27 },
    { feature: "contract_end_90d", correlation: 0.24 },
    { feature: "monthly_charges", correlation: -0.18 },
    { feature: "nps_score", correlation: -0.34 },
    { feature: "outage_hours_30d", correlation: 0.22 },
  ],
  distributions: {
    tenure: [4820, 6240, 9640, 8420, 10880, 8200],
    tenureLabels: ["0-6m", "7-12m", "13-24m", "25-36m", "37-60m", "60m+"],
    mrc: [8200, 12400, 14600, 8400, 4600],
    mrcLabels: ["<$50", "$50-$75", "$75-$100", "$100-$150", "$150+"],
  },
  churnByRegion: [
    { region: "North", churnRate: 21.4, count: 12800 },
    { region: "South", churnRate: 19.8, count: 11600 },
    { region: "East", churnRate: 16.2, count: 14200 },
    { region: "West", churnRate: 15.4, count: 9600 },
  ],
  churnByBundle: [
    { bundle: "Internet Only", churnRate: 24.8, count: 14400 },
    { bundle: "TV + Internet", churnRate: 16.2, count: 18600 },
    { bundle: "Triple Play", churnRate: 12.4, count: 15200 },
  ],
};

export const featureStudioData = {
  features: [
    { id: "f1", name: "tenure_months", category: "Lifecycle", type: "Numeric", importance: 0.92, stability: "Stable", selected: true, psi: 0.02, iv: 0.44 },
    { id: "f2", name: "monthly_charges", category: "Billing", type: "Numeric", importance: 0.87, stability: "Stable", selected: true, psi: 0.03, iv: 0.38 },
    { id: "f3", name: "nps_score", category: "Satisfaction", type: "Numeric", importance: 0.84, stability: "Stable", selected: true, psi: 0.04, iv: 0.35 },
    { id: "f4", name: "tickets_last_90d", category: "Service", type: "Numeric", importance: 0.81, stability: "Stable", selected: true, psi: 0.06, iv: 0.32 },
    { id: "f5", name: "usage_drop_3m", category: "Usage", type: "Derived", importance: 0.78, stability: "Drifting", selected: true, psi: 0.14, iv: 0.29 },
    { id: "f6", name: "fiber_presence_flag", category: "Competition", type: "Binary", importance: 0.75, stability: "Stable", selected: true, psi: 0.02, iv: 0.27 },
    { id: "f7", name: "price_shock_pct", category: "Billing", type: "Derived", importance: 0.73, stability: "Stable", selected: true, psi: 0.05, iv: 0.25 },
    { id: "f8", name: "promo_expiry_60d", category: "Billing", type: "Binary", importance: 0.71, stability: "Stable", selected: true, psi: 0.03, iv: 0.24 },
    { id: "f9", name: "contract_end_90d", category: "Contract", type: "Binary", importance: 0.69, stability: "Stable", selected: true, psi: 0.01, iv: 0.22 },
    { id: "f10", name: "outage_hours_30d", category: "Network", type: "Numeric", importance: 0.64, stability: "Drifting", selected: false, psi: 0.18, iv: 0.19 },
    { id: "f11", name: "bundle_type", category: "Product", type: "Categorical", importance: 0.61, stability: "Stable", selected: true, psi: 0.02, iv: 0.18 },
    { id: "f12", name: "value_tier", category: "Segment", type: "Categorical", importance: 0.58, stability: "Stable", selected: true, psi: 0.03, iv: 0.16 },
    { id: "f13", name: "prev_save_attempt", category: "History", type: "Binary", importance: 0.54, stability: "Stable", selected: false, psi: 0.04, iv: 0.14 },
    { id: "f14", name: "region", category: "Geography", type: "Categorical", importance: 0.48, stability: "Stable", selected: false, psi: 0.02, iv: 0.12 },
    { id: "f15", name: "age_segment", category: "Demographics", type: "Categorical", importance: 0.32, stability: "Stable", selected: false, psi: 0.03, iv: 0.08 },
  ],
  engineered: [
    { id: "ef1", name: "rolling_ticket_avg_90d", formula: "avg(tickets) over 90 days", type: "Rolling Avg", status: "Active" },
    { id: "ef2", name: "usage_trend_delta", formula: "usage_month - usage_3m_ago", type: "Delta", status: "Active" },
    { id: "ef3", name: "price_increase_flag", formula: "price_shock_pct > 0.10", type: "Flag", status: "Active" },
    { id: "ef4", name: "at_risk_composite", formula: "0.3*tickets + 0.4*usage_drop + 0.3*price_shock", type: "Composite", status: "Active" },
  ],
};

export const experimentLabData = {
  runs: [
    { id: "exp_108", algo: "XGBoost", auc: 0.847, recall: 0.82, precision: 0.71, f1: 0.76, topDecileCapture: 0.42, calibration: "Good", status: "Shortlisted", notes: "Best overall — selected for validation", duration: "4m 12s" },
    { id: "exp_107", algo: "LightGBM", auc: 0.841, recall: 0.80, precision: 0.69, f1: 0.74, topDecileCapture: 0.39, calibration: "Good", status: "Compared", notes: "Close second — faster training", duration: "2m 48s" },
    { id: "exp_106", algo: "Random Forest", auc: 0.823, recall: 0.77, precision: 0.67, f1: 0.72, topDecileCapture: 0.36, calibration: "Strong", status: "Compared", notes: "Stable, interpretable", duration: "6m 30s" },
    { id: "exp_105", algo: "Logistic Regression", auc: 0.776, recall: 0.72, precision: 0.64, f1: 0.68, topDecileCapture: 0.30, calibration: "Strong", status: "Baseline", notes: "Interpretable baseline", duration: "0m 45s" },
    { id: "exp_104", algo: "CatBoost", auc: 0.839, recall: 0.79, precision: 0.68, f1: 0.73, topDecileCapture: 0.38, calibration: "Good", status: "Compared", notes: "Good with categoricals", duration: "5m 15s" },
    { id: "exp_103", algo: "Neural Network", auc: 0.831, recall: 0.78, precision: 0.66, f1: 0.71, topDecileCapture: 0.37, calibration: "Moderate", status: "Rejected", notes: "Overfit on validation set", duration: "12m 00s" },
  ],
  rocData: [
    { fpr: 0, tpr: 0 }, { fpr: 0.05, tpr: 0.32 }, { fpr: 0.1, tpr: 0.52 },
    { fpr: 0.2, tpr: 0.68 }, { fpr: 0.3, tpr: 0.79 }, { fpr: 0.4, tpr: 0.86 },
    { fpr: 0.5, tpr: 0.91 }, { fpr: 0.7, tpr: 0.96 }, { fpr: 1, tpr: 1 },
  ],
  deciles: [
    { decile: 1, captureRate: 42, liftRatio: 4.2 },
    { decile: 2, captureRate: 34, liftRatio: 3.4 },
    { decile: 3, captureRate: 27, liftRatio: 2.7 },
    { decile: 4, captureRate: 19, liftRatio: 1.9 },
    { decile: 5, captureRate: 14, liftRatio: 1.4 },
    { decile: 6, captureRate: 11, liftRatio: 1.1 },
    { decile: 7, captureRate: 9, liftRatio: 0.9 },
    { decile: 8, captureRate: 7, liftRatio: 0.7 },
    { decile: 9, captureRate: 5, liftRatio: 0.5 },
    { decile: 10, captureRate: 4, liftRatio: 0.4 },
  ],
  shap: [
    { feature: "tenure_months", importance: 0.92 },
    { feature: "nps_score", importance: 0.84 },
    { feature: "tickets_last_90d", importance: 0.81 },
    { feature: "usage_drop_3m", importance: 0.78 },
    { feature: "fiber_presence_flag", importance: 0.75 },
    { feature: "price_shock_pct", importance: 0.73 },
    { feature: "monthly_charges", importance: 0.68 },
    { feature: "promo_expiry_60d", importance: 0.64 },
  ],
};

export const validationData = {
  champion: { name: "Churn Risk v3.1", auc: 0.824, recall: 0.79, precision: 0.68, topDecile: 0.38, stability: 0.91, calibration: 0.88 },
  challenger: { name: "Churn Risk v3.2 (XGBoost)", auc: 0.847, recall: 0.82, precision: 0.71, topDecile: 0.42, stability: 0.86, calibration: 0.91 },
  segments: [
    { segment: "High Value", championAUC: 0.87, challengerAUC: 0.89, winner: "Challenger" },
    { segment: "Mid Value", championAUC: 0.82, challengerAUC: 0.84, winner: "Challenger" },
    { segment: "Low Value", championAUC: 0.76, challengerAUC: 0.78, winner: "Challenger" },
    { segment: "North Region", championAUC: 0.81, challengerAUC: 0.85, winner: "Challenger" },
    { segment: "South Region", championAUC: 0.83, challengerAUC: 0.84, winner: "Challenger" },
  ],
  checklist: [
    { item: "Out-of-time validation (Q1 2026)", status: "Pass" },
    { item: "Segment-wise performance check", status: "Pass" },
    { item: "Calibration test", status: "Pass" },
    { item: "Data leakage audit", status: "Pass" },
    { item: "Region bias check", status: "Pass" },
    { item: "Value-segment bias check", status: "Pass" },
    { item: "Threshold sensitivity analysis", status: "Pass" },
    { item: "Business stakeholder sign-off", status: "Pending" },
    { item: "DS team sign-off", status: "Pass" },
    { item: "Deployment readiness review", status: "Pending" },
  ],
  fairness: [
    { dimension: "Region", bias: "Low", score: 0.98 },
    { dimension: "Value Tier", bias: "Low", score: 0.96 },
    { dimension: "Tenure Group", bias: "Minimal", score: 0.94 },
  ],
};

export const deploymentData = {
  deployments: [
    { id: "dep1", model: "Churn Risk v3.2", env: "Production", mode: "Batch Daily", sla: "99.9%", lastRun: "2026-03-12 02:00", nextRun: "2026-03-13 02:00", status: "Running", scored: 48200, latency: "4.2s avg" },
    { id: "dep2", model: "Driver Attribution v2.1", env: "Production", mode: "Batch Daily", sla: "99.5%", lastRun: "2026-03-12 03:00", nextRun: "2026-03-13 03:00", status: "Running", scored: 48200, latency: "6.1s avg" },
    { id: "dep3", model: "Next Best Action v1.4", env: "Production", mode: "Real-time API", sla: "99.9%", lastRun: "Live", nextRun: "Live", status: "Running", scored: 0, latency: "42ms p99" },
    { id: "dep4", model: "Revenue-at-Risk v1.0", env: "Production", mode: "Batch Weekly", sla: "99.0%", lastRun: "2026-03-10 04:00", nextRun: "2026-03-17 04:00", status: "Running", scored: 48200, latency: "8.4s avg" },
    { id: "dep5", model: "Save Probability v2.0", env: "Production", mode: "Event-triggered", sla: "99.5%", lastRun: "2026-03-12 11:24", nextRun: "On trigger", status: "Standby", scored: 840, latency: "28ms p99" },
    { id: "dep6", model: "Migration Propensity v1.2", env: "Staging", mode: "Batch Weekly", sla: "98.0%", lastRun: "2026-03-11 04:00", nextRun: "2026-03-18 04:00", status: "Running", scored: 48200, latency: "5.8s avg" },
  ],
  thresholds: [
    { model: "Churn Risk v3.2", low: 0.30, medium: 0.60, high: 0.80 },
    { model: "Save Probability v2.0", low: 0.40, medium: 0.65, high: 0.85 },
  ],
  outputMapping: [
    { model: "Churn Risk v3.2", target: "Customer Risk Intelligence", field: "churnRiskScore" },
    { model: "Churn Risk v3.2", target: "Retention Action Center", field: "riskTier" },
    { model: "Driver Attribution v2.1", target: "Churn Diagnostics", field: "churnDriver" },
    { model: "Next Best Action v1.4", target: "Retention Action Center", field: "recommendedAction" },
    { model: "Revenue-at-Risk v1.0", target: "Business Impact", field: "revenueAtRisk" },
  ],
};

export const monitoringData = {
  summary: { liveModels: 5, healthyModels: 3, driftAlerts: 2, staleModels: 1, predictionCoverage: 98.4 },
  healthTimeline: [
    { date: "Mar 06", churnRisk: 88, driverAttr: 81, nba: 75 },
    { date: "Mar 07", churnRisk: 87, driverAttr: 80, nba: 74 },
    { date: "Mar 08", churnRisk: 86, driverAttr: 78, nba: 73 },
    { date: "Mar 09", churnRisk: 87, driverAttr: 76, nba: 72 },
    { date: "Mar 10", churnRisk: 88, driverAttr: 74, nba: 71 },
    { date: "Mar 11", churnRisk: 86, driverAttr: 72, nba: 70 },
    { date: "Mar 12", churnRisk: 88, driverAttr: 71, nba: 69 },
  ],
  driftMetrics: [
    { model: "Churn Risk v3.2", feature: "usage_drop_3m", psi: 0.14, ks: 0.09, status: "Warning" },
    { model: "Churn Risk v3.2", feature: "outage_hours_30d", psi: 0.18, ks: 0.12, status: "Alert" },
    { model: "Driver Attribution v2.1", feature: "tickets_last_90d", psi: 0.22, ks: 0.15, status: "Alert" },
    { model: "Driver Attribution v2.1", feature: "tenure_months", psi: 0.04, ks: 0.03, status: "Stable" },
    { model: "Save Probability v2.0", feature: "promo_expiry_60d", psi: 0.06, ks: 0.04, status: "Stable" },
  ],
  performanceDecay: [
    { date: "Jan", auc: 0.86, recall: 0.84, precision: 0.73 },
    { date: "Feb", auc: 0.85, recall: 0.83, precision: 0.72 },
    { date: "Mar", auc: 0.847, recall: 0.82, precision: 0.71 },
  ],
  predictionDistribution: [
    { bucket: "0.0-0.2", count: 18200 },
    { bucket: "0.2-0.4", count: 14400 },
    { bucket: "0.4-0.6", count: 8200 },
    { bucket: "0.6-0.8", count: 4800 },
    { bucket: "0.8-1.0", count: 2600 },
  ],
};

export const recommendationOpsData = {
  summary: { totalRecs: 12400, servedToday: 1840, acceptanceRate: 64.2, avgUplift: 18.4, modelsActive: 3 },
  engines: [
    { id: "re1", name: "Churn Retention Engine", model: "Next Best Action v1.4", status: "Active", recs: 8400, acceptance: 66.2, coverage: 98.2 },
    { id: "re2", name: "Fiber Migration Engine", model: "Migration Propensity v1.2", status: "Active", recs: 2800, acceptance: 58.4, coverage: 94.1 },
    { id: "re3", name: "Uplift Treatment Engine", model: "Uplift Treatment v1.1", status: "Pilot", recs: 1200, acceptance: 61.0, coverage: 88.4 },
  ],
  actionDistribution: [
    { action: "Discount Offer", count: 4200, acceptRate: 72 },
    { action: "Loyalty Credit", count: 2800, acceptRate: 68 },
    { action: "Speed Upgrade", count: 1800, acceptRate: 61 },
    { action: "Contract Lock", count: 1600, acceptRate: 55 },
    { action: "Agent Call", count: 2000, acceptRate: 48 },
  ],
  recTimeline: [
    { date: "Mar 06", served: 1620, accepted: 1040 },
    { date: "Mar 07", served: 1740, accepted: 1120 },
    { date: "Mar 08", served: 1680, accepted: 1080 },
    { date: "Mar 09", served: 1800, accepted: 1160 },
    { date: "Mar 10", served: 1860, accepted: 1200 },
    { date: "Mar 11", served: 1820, accepted: 1160 },
    { date: "Mar 12", served: 1840, accepted: 1180 },
  ],
};

export const outcomesData = {
  summary: { modelsTracked: 5, totalPredictions: 240800, actualChurn: 8764, predictedChurn: 8840, saveActions: 3420, successfulSaves: 2196, revenueProtected: 426400 },
  modelAccuracy: [
    { model: "Churn Risk v3.2", period: "Q1 2026", auc: 0.847, precision: 0.71, recall: 0.82, f1: 0.76, brier: 0.14 },
    { model: "Driver Attribution v2.1", period: "Q1 2026", auc: 0.0, precision: 0.68, recall: 0.74, f1: 0.71, brier: 0.0 },
    { model: "Save Probability v2.0", period: "Q1 2026", auc: 0.79, precision: 0.67, recall: 0.78, f1: 0.72, brier: 0.18 },
  ],
  saveFunnel: [
    { stage: "At-Risk Identified", count: 8764 },
    { stage: "Action Recommended", count: 6800 },
    { stage: "Action Executed", count: 3420 },
    { stage: "Customer Retained", count: 2196 },
  ],
  revenueImpact: [
    { month: "Jan", protected: 142000, lost: 38200 },
    { month: "Feb", protected: 138400, lost: 41800 },
    { month: "Mar", protected: 146000, lost: 36400 },
  ],
};

export const governanceData = {
  summary: { totalModels: 12, approvedModels: 7, pendingApproval: 2, expiredReviews: 1, complianceScore: 91 },
  auditLog: [
    { id: "al1", timestamp: "2026-03-12 08:14", action: "Model Deployed", model: "Churn Risk v3.2", user: "j.smith@copper.com", status: "Success" },
    { id: "al2", timestamp: "2026-03-11 16:42", action: "Model Approved", model: "Churn Risk v3.2", user: "m.jones@copper.com", status: "Success" },
    { id: "al3", timestamp: "2026-03-11 14:20", action: "Validation Completed", model: "Churn Risk v3.2", user: "a.lee@copper.com", status: "Success" },
    { id: "al4", timestamp: "2026-03-10 11:08", action: "Experiment Registered", model: "exp_108", user: "j.smith@copper.com", status: "Success" },
    { id: "al5", timestamp: "2026-03-09 09:30", action: "Model Retrain Triggered", model: "Driver Attribution v2.1", user: "system", status: "In Progress" },
    { id: "al6", timestamp: "2026-03-08 17:00", action: "Drift Alert Acknowledged", model: "Driver Attribution v2.1", user: "a.lee@copper.com", status: "Success" },
    { id: "al7", timestamp: "2026-03-07 10:15", action: "Feature Set Updated", model: "Churn Risk v3.2", user: "j.smith@copper.com", status: "Success" },
    { id: "al8", timestamp: "2026-03-06 14:00", action: "Model Rollback Requested", model: "Save Probability v1.9", user: "m.jones@copper.com", status: "Success" },
  ],
  approvals: [
    { id: "ap1", model: "Churn Risk v3.2", type: "Production Deployment", dsSignoff: true, bizSignoff: true, complianceReview: true, status: "Approved", date: "2026-03-11" },
    { id: "ap2", model: "Uplift Treatment v1.1", type: "Pilot Deployment", dsSignoff: true, bizSignoff: false, complianceReview: false, status: "Pending", date: "2026-03-12" },
    { id: "ap3", model: "Anomaly Early Warning v1.0", type: "Validation Sign-off", dsSignoff: true, bizSignoff: false, complianceReview: false, status: "Pending", date: "2026-03-12" },
  ],
  policies: [
    { id: "p1", name: "Model Retraining Policy", version: "v2.1", lastReview: "2026-02-15", nextReview: "2026-05-15", status: "Active" },
    { id: "p2", name: "Data Retention Policy", version: "v1.4", lastReview: "2026-01-10", nextReview: "2026-04-10", status: "Active" },
    { id: "p3", name: "Bias & Fairness Standard", version: "v1.2", lastReview: "2026-03-01", nextReview: "2026-06-01", status: "Active" },
    { id: "p4", name: "Model Explainability Standard", version: "v1.0", lastReview: "2025-12-01", nextReview: "2026-03-01", status: "Overdue" },
  ],
};
