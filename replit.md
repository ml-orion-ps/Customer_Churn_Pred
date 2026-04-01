# Copper Churn Intelligence Platform

## Overview
A decision intelligence platform for a US internet service provider focusing on copper service churn. Follows Palantir/McKinsey design patterns with decision-first layout, insight→diagnosis→action→impact hierarchy. Combines business analytics with ML workflow pipeline.

## Architecture
- **Frontend**: React + TypeScript + Vite, Shadcn UI components, Recharts for visualization, Wouter for routing
- **Backend**: Express.js with TypeScript, PostgreSQL via Drizzle ORM
- **Database**: PostgreSQL with tables for customers, churn_events, datasets, ml_models, predictions, recommendations, audit_log
- **Theme**: Dark navy primary (#1a2744), copper/amber accent, risk colors (red/amber/green)

## Navigation & Pages

### Business Intelligence (6 sections, URL-synced tabs)
1. **Command Center** `/` — Executive dashboard with KPIs, churn trend, risk distribution, top drivers, segments, alerts
2. **Churn Diagnostics** `/churn-diagnostics/:tab` — Pattern Explorer, Segment Intelligence, Driver Analysis, Financial Impact
3. **Customer Risk Intelligence** `/risk-intelligence/:tab` — Risk Overview, Customer Risk Explorer (with drill-down profile dialog), Early Warning Signals
4. **Retention Action Center** `/retention/:tab` — Recommended Actions, Intervention Queue (with status management), Execution Tracker
5. **Business Impact** `/business-impact/:tab` — Revenue Protection, ROI Analysis, Migration Economics
6. **Strategy Insights** `/strategy/:tab` — Competitive Landscape, Network Health Impact, Migration Intelligence

### ML Orion — Decision Model Factory (6 pages, /orion/*)
All 6 pages have cross-page nav (OrionNav breadcrumb at top).
1. **Overview** `/orion/overview` — Model health dashboard, KPIs, drift alerts
2. **Data** `/orion/data` — Dataset registry (delete with confirm + audit), EDA sub-tabs (Overview/Univariate/Bivariate/Multivariate/Time Trends/Correlation/Data Risks using live DB via /api/orion/eda-live), Feature Builder (7 types: rolling/lag/trend/ratio/flag/segment/interaction)
3. **Experiments** `/orion/experiments` — Train models (6 algorithms), live DB training, comparison, deploy/experiment links
4. **Deploy** `/orion/deploy` — Deploy/undeploy/delete, Score All Customers, Monitoring sub-tabs (Overview/Drift/Coverage), PSI/KS/drift bars, prediction coverage stacked bars, Submit for Approval dialog with approve/reject workflow
5. **Outcomes** `/orion/outcomes` — Post-deployment accuracy, save funnel, revenue impact
6. **Governance** `/orion/governance` — Model registry (with trained/deployed dates, approval status, approver), real audit log from DB (action/entity/user/team/status), Compliance matrix

#### ML Orion — Real ML Training
- **6 real ML algorithms** implemented from scratch in `server/ml-trainer.ts`:
  - **Logistic Regression** — SGD with L2 regularization, z-score normalization
  - **SVM** — Pegasos linear SVM (online SGD), normalized features
  - **Gradient Boosting** — Decision stumps with log-loss gradient, 100 estimators
  - **XGBoost** — Newton step stumps + L2 leaf regularization, 100 estimators
  - **Random Forest** — `ml-random-forest` npm package, bagging + feature subsets
  - **Neural Network** — 2-hidden-layer MLP (28→16→8→1), backpropagation from scratch
- **Feature matrix**: 28 features (9 numeric + 2 boolean + 3 contract OHE + 4 tier OHE + 10 region OHE)
- **Model weights stored in DB**: `modelWeights jsonb` column on `ml_models` table
- **Real scoring**: `scoreCustomer()` uses stored weights to compute actual probabilities for all active customers
- Mock data for orion-overview/outcomes/governance in `server/orion-mock.ts`
- API routes at `/api/orion/*` registered via `registerOrionRoutes()` in `server/routes.ts`
- Shared layout component: `client/src/components/orion-layout.tsx`

## API Endpoints

### Business Analytics
- `GET /api/analytics/command-center` — Command Center KPIs, trends, alerts
- `GET /api/analytics/churn-diagnostics` — Patterns, segments, drivers, financial impact
- `GET /api/analytics/risk-intelligence` — Risk distribution, probability curve, early warnings
- `GET /api/analytics/retention` — Actions, intervention queue, execution tracker
- `GET /api/analytics/business-impact` — Revenue protection, ROI, migration economics
- `GET /api/analytics/strategy` — Competitive landscape, network health, migration data
- `GET /api/dashboard` — Legacy dashboard analytics
- `GET /api/segments` — Segment breakdown data

### Customer & Data
- `GET /api/customers` — Paginated customer list with filters
- `GET /api/customers/:id` — Customer detail with predictions and recommendations
- `GET /api/recommendations` — Recommendations list
- `PATCH /api/recommendations/:id` — Update recommendation status

### ML Pipeline
- `POST /api/datasets/upload` — CSV upload with full-data stats computation
- `POST /api/datasets/:id/quality-check` — Data quality analysis
- `POST /api/datasets/:id/eda` — Exploratory data analysis
- `POST /api/datasets/:id/feature-selection` — Feature scoring
- `POST /api/models/train` — Dataset-based model training (formula fallback)
- `POST /api/models/train-live` — **Real ML training** using live customer DB (`trainAlgorithm()` from ml-trainer.ts)
- `POST /api/models/:id/deploy` — Model deployment
- `POST /api/models/:id/predict-customers` — **Real scoring** using stored model weights (`scoreCustomer()` from ml-trainer.ts)

## File Structure
- `shared/schema.ts` — Database schema (6 tables)
- `server/routes.ts` — API endpoints (analytics + ML pipeline)
- `server/storage.ts` — Database operations with analytics methods
- `server/seed.ts` — 500 customers seed data
- `client/src/pages/dashboard.tsx` — Command Center
- `client/src/pages/churn-diagnostics.tsx` — Churn Diagnostics (4 tabs)
- `client/src/pages/risk-intelligence.tsx` — Risk Intelligence (3 tabs + profile dialog)
- `client/src/pages/retention-center.tsx` — Retention Action Center (3 tabs)
- `client/src/pages/business-impact.tsx` — Business Impact (3 tabs)
- `client/src/pages/strategy-insights.tsx` — Strategy Insights (3 tabs)
- `client/src/pages/ml-*.tsx` — ML workflow pages (6 files)
- `client/src/components/app-sidebar.tsx` — Sidebar with collapsible navigation groups
- `client/src/components/kpi-card.tsx` — Reusable KPI card component

## Data Model
- 500 seeded copper customers with realistic ISP data
- Churn events with reasons, destinations, revenue impact
- Predictions with risk scores and drivers
- Recommendations with action types (Save/Migrate/Remediate) and status tracking

## ML Pipeline Architecture
- Upload: Full-dataset column stats computed at upload, 500-row sample stored
- Quality: Pre-computed column-level stats from full dataset
- EDA: Full-data distributions, 500-row sample correlations
- Feature Selection: Scores from EDA correlations, missing values, variance
- Model Training: Data-driven metrics using actual churn rate and features

## Dependencies
- multer, papaparse, simple-statistics (backend)
- recharts, wouter, drizzle-orm, @tanstack/react-query, shadcn/ui (frontend)
