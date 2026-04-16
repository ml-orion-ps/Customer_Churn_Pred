# ML Orion

ML Orion is a full-stack churn intelligence and model operations application. It combines a React frontend, an Express and PostgreSQL backend, and a Python-based ML layer for training, scoring, and explainability.

## Repository Guide

- Developer onboarding and architecture guide: [docs/developer-guide.md](docs/developer-guide.md)
- Full rebuild and handoff blueprint: [docs/rebuild-handoff.md](docs/rebuild-handoff.md)
- Frontend, backend, and ML folder breakdown: [codebase-structure.md](codebase-structure.md)

## Stack

- Frontend: React, TypeScript, Vite, Wouter, TanStack Query, Recharts, Shadcn UI
- Backend: Node.js, Express, TypeScript
- Database: PostgreSQL with Drizzle ORM
- ML: Python, pandas, numpy, scikit-learn, LightGBM, XGBoost, SHAP

## Main Areas

- Business Intelligence: `/`, `/churn-diagnostics`, `/risk-intelligence`, `/retention`, `/business-impact`, `/strategy`
- ML Orion: `/orion/overview`, `/orion/data`, `/orion/experiments`, `/orion/deploy`, `/orion/outcomes`, `/orion/governance`

## Runtime Flow

1. The React app in `client/` renders the UI.
2. The frontend calls APIs implemented in `server/routes.ts`.
3. The backend reads and writes data through `server/storage.ts` and `shared/schema.ts`.
4. Training and explanation jobs are delegated to the Python scripts in `server/python-ml/` through `server/python-executor.ts`.

## Notes

- The application currently runs as a single Node server that serves both API and frontend in production.
- Model deployment in the app is a database-managed deployment state, not a separate dedicated model-serving microservice.
- Local development still includes schema bootstrap and seed behavior, so production setup should disable seed usage.
