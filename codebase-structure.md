# ML Orion Codebase Structure

This document explains how the repository is organized so contributors can quickly understand where the frontend, backend, and ML code live.

## High-Level Layout

```text
ML-Orion/
|- client/                React frontend
|- server/                Express backend and orchestration layer
|- server/python-ml/      Python ML training and explanation scripts
|- shared/                Shared schema and types used across layers
|- script/                Build utilities
|- attached_assets/       Reference notes and imported assets
|- README.md              Project overview
|- package.json           Node scripts and dependencies
|- drizzle.config.ts      Database migration configuration
|- vite.config.ts         Frontend build configuration
|- tailwind.config.ts     Tailwind configuration
|- tsconfig.json          TypeScript configuration
```

## Frontend

The frontend lives under `client/` and is a React plus TypeScript application built with Vite.

### Frontend structure

```text
client/
|- index.html
|- public/                Static assets
|- src/
   |- App.tsx             Main route registration
   |- main.tsx            Frontend entry point
   |- index.css           Global styles and theme tokens
   |- components/         Shared UI and layout components
   |- data/               Static demo and use-case metadata
   |- hooks/              Reusable React hooks
   |- lib/                Query client and utility helpers
   |- pages/              Route-level screens
```

### Important frontend folders

- `client/src/pages/`
  Contains the route screens for both business dashboards and the ML Orion workspace.
  Key pages include:
  - `dashboard.tsx`
  - `churn-diagnostics.tsx`
  - `risk-intelligence.tsx`
  - `retention-center.tsx`
  - `business-impact.tsx`
  - `strategy-insights.tsx`
  - `orion-overview.tsx`
  - `orion-data.tsx`
  - `orion-experiments.tsx`
  - `orion-deploy.tsx`
  - `orion-outcomes.tsx`
  - `orion-governance.tsx`

- `client/src/components/`
  Contains shared UI and layout building blocks.
  Notable files include:
  - `app-sidebar.tsx`
  - `orion-layout.tsx`
  - `kpi-card.tsx`
  - `ui/` for reusable Shadcn-style primitives

- `client/src/lib/`
  Holds app-level helpers such as the React Query client and shared utility functions.

### Frontend responsibility

The frontend is responsible for:
- rendering dashboards and ML pages
- collecting user actions such as upload, training, scoring, and deployment
- calling backend APIs
- displaying metrics, predictions, feature importance, drift, and governance information

## Backend

The backend lives under `server/` and is an Express plus TypeScript application.

### Backend structure

```text
server/
|- index.ts               Express app bootstrap
|- routes.ts              Main REST API routes
|- storage.ts             Database access layer
|- db.ts                  PostgreSQL and Drizzle setup
|- static.ts              Production static-file serving
|- vite.ts                Development Vite integration
|- python-executor.ts     Bridge from Node to Python scripts
|- custom-feature-engine.ts      Custom feature validation and transforms
|- custom-feature-engine.test.ts Smoke test for feature-engine logic
|- seed.ts                Local/dev seed data generation
|- ml-trainer.ts          Older TypeScript ML logic and experiments
|- orion-mock.ts          Mock and demo helpers
|- python-ml/             Active Python ML pipeline
```

### Important backend files

- `server/index.ts`
  Starts the Express server, registers routes, and serves the built frontend in production.

- `server/routes.ts`
  Central API layer. This file handles:
  - analytics APIs
  - dataset upload and EDA APIs
  - custom feature builder APIs
  - model training and scoring APIs
  - deployment, governance, and audit routes

- `server/storage.ts`
  Encapsulates database reads and writes through Drizzle.

- `server/db.ts`
  Creates the PostgreSQL connection using `DATABASE_URL`.

- `server/python-executor.ts`
  Writes temp JSON payloads, launches Python scripts, and reads structured output back into Node.

- `server/custom-feature-engine.ts`
  Applies dataset-level custom features such as lag, rolling, trend, ratio, flag, segment tag, and interaction features.

### Backend responsibility

The backend is responsible for:
- serving REST APIs to the frontend
- persisting customers, datasets, models, predictions, recommendations, and audit logs
- transforming uploaded data
- orchestrating model training and scoring
- managing deploy and undeploy state for models

## ML Layer

The active ML layer is primarily Python-based and lives under `server/python-ml/`.

### ML structure

```text
server/python-ml/
|- train_model.py         Main training pipeline
|- calculate_shap.py      Explanation and fallback scoring logic
|- churn_pipeline_complete.py  Notebook-aligned reference pipeline
|- requirements.txt       Python dependencies
|- cv_results.csv         Reference output artifact
```

### Important ML files

- `server/python-ml/train_model.py`
  Main training entry point used by the backend. It handles:
  - dataset preparation
  - notebook-style feature engineering for Brightspeed-format data
  - walk-forward CV and OOS handling when time history exists
  - Auto model family selection
  - feature importance generation
  - latest active customer scoring after training

- `server/python-ml/calculate_shap.py`
  Used when the backend needs explanation output for scored customers.

- `server/python-ml/requirements.txt`
  Defines the Python dependencies used by the ML runtime.

### ML execution flow

1. The frontend triggers a training or scoring action.
2. `server/routes.ts` prepares the input payload.
3. `server/python-executor.ts` runs the appropriate Python script.
4. Python returns metrics, feature importance, predictions, and explanation data.
5. The backend persists results to PostgreSQL and returns the response to the frontend.

## Shared Layer

Shared contracts live under `shared/`.

```text
shared/
|- schema.ts              Drizzle schema and shared Zod types
```

### Shared responsibility

`shared/schema.ts` defines the database tables and shared types used by both the backend and the frontend. This is the contract file for:
- customers
- datasets
- ML models
- predictions
- recommendations
- audit logs
- custom feature definitions

## Build and Tooling

```text
script/
|- build.ts               Production build script
```

### Build flow

- `npm run dev`
  Starts the backend in development mode and uses Vite for the frontend.

- `npm run build`
  Builds the frontend with Vite and bundles the backend with esbuild.

- `npm run start`
  Runs the production Node server from the `dist/` output.

## Suggested Reading Order

If you are new to the repo, start in this order:

1. `README.md`
2. `client/src/App.tsx`
3. `server/index.ts`
4. `server/routes.ts`
5. `server/storage.ts`
6. `shared/schema.ts`
7. `server/python-executor.ts`
8. `server/python-ml/train_model.py`

## Current Architectural Notes

- The main training path currently uses the Python scripts, not only the older TypeScript trainer.
- Uploaded datasets can persist custom engineered features and use them during training.
- Live customer DB training exists, but full historical live-feature engineering is still a separate future enhancement.
- Some demo and mock helpers still exist in the repository, but the core training and persistence path is backed by the Express, PostgreSQL, and Python stack.