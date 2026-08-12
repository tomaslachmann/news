# Spec — Project Scaffold

## Problem Statement

Before any feature of the News Triangulator can be built or run, the project needs a reproducible development environment: consistent toolchain versions across machines, a monorepo structure that lets the frontend and backend share TypeScript types, a local development workflow with fast feedback, and a Docker Compose setup that mirrors production. Without this foundation, every subsequent build task starts with implicit assumptions about what is installed and where things live.

## Solution

A fully scaffolded npm workspaces monorepo with three packages — `shared`, `frontend`, `backend` — pinned to a specific Node.js version via `mise.toml`. The backend is a Fastify TypeScript server connected to PostgreSQL via Prisma. The frontend is a Vite + React + TypeScript app using shadcn/ui and Tailwind, with React Router v7 for navigation. Local development runs the frontend and backend natively (with hot-reload) while PostgreSQL runs in Docker. A root-level `dev` script starts everything with one command. A Docker Compose file builds and runs all three services for production-like local testing.

## User Stories

### Toolchain

1. As a developer, I want Node.js and npm versions pinned in `mise.toml`, so that I always use the same runtime regardless of what is installed globally on my machine.
2. As a developer, I want to run `mise install` once after cloning, so that the correct Node version is activated automatically in this directory.
3. As a developer, I want to install all workspace dependencies with a single `npm install` at the root, so that setup requires no per-package manual steps.

### Monorepo Structure

4. As a developer, I want a `packages/shared` workspace containing TypeScript type definitions for SSE events, API request/response shapes, and Analysis Dimension objects, so that frontend and backend cannot drift out of sync on the shapes they exchange.
5. As a developer, I want `packages/shared` to contain only type definitions and no runtime code, so that it adds zero bundle weight to either the frontend or backend.
6. As a developer, I want `packages/frontend` and `packages/backend` to import from `packages/shared` using the workspace package name, so that type sharing works the same in development and after a Docker build.

### Backend Package

7. As a developer, I want the Fastify server to start with `npm run dev` in `packages/backend`, watching for file changes and restarting automatically, so that backend changes are reflected without a manual restart.
8. As a developer, I want the backend to read all configuration (database URL, OpenAI API key, model names) from environment variables, so that no secrets are hardcoded.
9. As a developer, I want a health-check route (`GET /api/health`) that returns 200, so that I can verify the server is running without needing any feature logic in place.
10. As a developer, I want Prisma configured with a schema covering the `analyses`, `coverages`, and `synthesis_result` tables, so that the database structure is defined before any route touches it.
11. As a developer, I want Prisma migrations to run automatically when the Docker backend container starts, so that the database schema is always in sync with the code without a manual step.
12. As a developer, I want the backend TypeScript compiled and the output served by Node in the Docker image, so that the production container does not depend on `tsx` or `ts-node`.

### Frontend Package

13. As a developer, I want the Vite dev server to start with `npm run dev` in `packages/frontend`, so that frontend changes hot-reload in the browser instantly.
14. As a developer, I want Vite configured to proxy `/api/*` requests to `localhost:3001` during development, so that the frontend can reach the backend without CORS configuration in dev.
15. As a developer, I want Tailwind CSS configured and working in the frontend, so that utility classes are available immediately.
16. As a developer, I want the shadcn/ui CLI initialised with the default style and CSS variables, so that I can add components with `npx shadcn add` without further setup.
17. As a developer, I want React Router v7 installed and configured with the four application routes — `/` (seed input), `/review` (Coverage review), `/analysis/:id` (streamed results), `/history` — so that navigation structure is in place before page components are built.
18. As a developer, I want each route to render a minimal placeholder component, so that navigation between routes is testable from day one.

### Local Development Workflow

19. As a developer, I want a root-level `npm run dev` script that concurrently starts the backend (with hot-reload) and the frontend (Vite dev server), so that I only need one terminal for development.
20. As a developer, I want a root-level `npm run db` script that runs `docker compose up db`, so that starting only the Postgres container is a single remembered command.
21. As a developer, I want a `.env.example` file at the root documenting every required environment variable with a placeholder value and a one-line description, so that setup instructions are self-contained in the repo.
22. As a developer, I want a `.env` file (git-ignored) at the root read by both the local backend and Docker Compose, so that secrets are configured in one place.

### Docker Compose

23. As a developer, I want `docker compose up` to build and start all three services — backend, frontend (nginx), and PostgreSQL — so that the full application runs without installing anything beyond Docker.
24. As a developer, I want the `frontend` Docker service to build the Vite app and serve it via nginx, so that the production-like setup uses a real static file server.
25. As a developer, I want the `backend` Docker service to depend on the `db` service and wait for Postgres to be ready before starting, so that the backend never crashes on startup due to a database connection race.
26. As a developer, I want PostgreSQL data persisted in a named Docker volume, so that analysis history survives container restarts and `docker compose down`.
27. As a developer, I want the Docker Compose network to allow the backend to reach Postgres via the service name `db`, so that `DATABASE_URL` does not need to reference an IP address.

## Implementation Decisions

### Toolchain pinning
`mise.toml` at the repository root pins the Node.js LTS version. The file is checked into version control. Developers activate it with `mise install`. This guarantees identical runtime versions across machines without relying on `.nvmrc` or manual global installs.

### Workspace layout
```
packages/
  shared/     — TypeScript types only, no build step required for development
  backend/    — Fastify, Prisma, OpenAI client, SSE routes
  frontend/   — Vite, React, shadcn/ui, Tailwind, React Router v7
```
Root `package.json` declares workspaces and holds `dev`, `db`, and `build` scripts.

### Shared package contract
`packages/shared` exports TypeScript interfaces for:
- SSE event union type (one variant per pipeline stage: `sources-confirmed`, `extraction-complete`, `synthesis-complete`, `warning`, `error`)
- API response types for `GET /api/analyses` and `GET /api/analyses/:id`
- The Analysis Dimension shape (agreement items, contradictions, unique reports, framing differences), each item carrying outlet name, English prose, and original Czech quote

No runtime code lives in shared — it is a types-only package.

### Prisma schema (three models)
- `Analysis` — id, seedUrl, seedHeadline, createdAt, status (enum: pending | complete | failed)
- `Coverage` — id, analysisId, outlet, articleUrl, extractedText, extractionResult (Json), status (enum: ok | extraction-failed)
- `SynthesisResult` — id, analysisId, dimensions (Json)

### API surface (stubs at scaffold stage)
- `GET /api/health` → 200
- `POST /api/analyses` → 202, returns `{ analysisId }`
- `GET /api/analyses/:id/stream` → SSE stream
- `GET /api/analyses` → list of past Analyses for `/history`
- `PATCH /api/analyses/:id/coverages` → accepts user Review Step selections

Routes are registered as stubs at scaffold stage; logic is filled in by subsequent feature tasks.

### Local dev ports
- Backend: 3001
- Frontend (Vite): 5173
- PostgreSQL: 5432 (exposed to host for Prisma Studio / inspection)

### Environment variables
All required vars documented in `.env.example`:
- `DATABASE_URL` — Prisma connection string
- `OPENAI_API_KEY`
- `EXTRACTION_MODEL` (default: `gpt-4o`)
- `SYNTHESIS_MODEL` (default: `gpt-4o`)

## Testing Decisions

A good test at the scaffold stage verifies that the wired-up structure works end-to-end, not that individual helper functions return the right value.

### Seam
The single test seam is the **Fastify HTTP API**. One integration test file sends an HTTP request to `GET /api/health` against a real running Fastify instance (with a real Prisma client connected to a test Postgres database) and asserts a 200 response. This test proves that the server boots, connects to the database, and handles requests — the full scaffold chain — without testing any implementation detail.

### What passes at scaffold completion
- `GET /api/health` returns 200
- Prisma client can run `db.analysis.findMany()` without error (proves schema migration ran)
- `npm run dev` starts without errors in both packages
- `docker compose up` brings all three services to healthy status
- `npm run build` in `packages/frontend` produces a `dist/` directory without TypeScript errors
- Types imported from `packages/shared` resolve correctly in both `packages/frontend` and `packages/backend`

### Prior art
No existing tests — this is the first test in the project. The integration test pattern established here (real Fastify instance + real Prisma + test Postgres) becomes the standard for all subsequent backend tests.

## Out of Scope

- Any Analysis pipeline logic (Discovery, Extraction, Synthesis)
- Any UI beyond route placeholder components
- Linting, formatting, or pre-commit hooks
- CI/CD pipeline
- Production deployment (beyond Docker Compose)
- Authentication

## Further Notes

The scaffold is intentionally thin. Its only job is to make the subsequent feature tasks start from a known good state: types shared, database connected, routes registered as stubs, hot-reload working, Docker Compose verified. Every feature task builds on top of this without revisiting toolchain decisions.

The `packages/shared` SSE event union type is the most load-bearing decision in the scaffold: it is the contract between the streaming backend and the streaming frontend, and getting its shape right before either side is implemented avoids a painful refactor mid-feature.
