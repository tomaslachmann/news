# 01 — Project Scaffold

**What to build:** The repository starts from a blank slate. This ticket creates the entire foundation that every subsequent ticket assumes exists: a git repository with a proper `.gitignore`, a reproducible toolchain, a working monorepo, a Fastify backend serving a health-check route connected to PostgreSQL via Prisma, a React frontend with four placeholder routes styled with shadcn/ui and Tailwind, a Docker Compose file that brings all three services up together, and a root `README.md` that makes the project navigable for anyone cloning it. A developer can clone the repo, run `mise install && npm install`, start Postgres with `npm run db`, and run `npm run dev` to get both servers hot-reloading. `docker compose up` also produces a running application.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] Git repository is initialised; `.gitignore` covers `node_modules`, `dist`, `.env`, Prisma generated client, and OS/editor noise
- [x] `mise.toml` at the repository root pins Node.js LTS and npm versions
- [x] `npm install` at root installs all workspace dependencies across all three packages
- [x] `packages/shared` exports a TypeScript SSE event union type (variants: `sources-confirmed`, `extraction-complete`, `extraction-error`, `synthesis-complete`, `synthesis-error`, `warning`) and an Analysis Dimension type shape — no runtime code, types only
- [x] `packages/frontend` and `packages/backend` import from `packages/shared` using the workspace package name and TypeScript resolves the imports without error
- [x] `GET /api/health` on the Fastify backend returns `200 { ok: true }`
- [x] Prisma schema defines three models: `Analysis` (id, seedUrl, seedHeadline, status, createdAt), `Coverage` (id, analysisId, outlet, articleUrl, extractedText, extractionResult Json, status), `SynthesisResult` (id, analysisId, dimensions Json); `prisma migrate dev` runs without error
- [x] Vite dev server starts; four routes (`/`, `/review`, `/analysis/:id`, `/history`) each render a placeholder heading
- [x] Tailwind is configured and a shadcn/ui `Button` component renders without error on the placeholder home page
- [x] React Router v7 is configured; navigating between the four routes works in the browser
- [x] Root `npm run dev` concurrently starts the Fastify backend (port 3001, tsx watch) and the Vite frontend (port 5173)
- [x] Root `npm run db` runs `docker compose up db` to start only the Postgres container
- [x] `docker compose up` builds and starts all three services; `GET http://localhost:3001/api/health` returns 200 from inside the compose network
- [x] Nginx in the frontend Docker service correctly serves the Vite build and proxies `/api/*` to the backend service
- [x] `.env.example` at the root documents all required variables: `DATABASE_URL`, `OPENAI_API_KEY`, `EXTRACTION_MODEL` (default: `gpt-4o`), `SYNTHESIS_MODEL` (default: `gpt-4o`)
- [x] Root `README.md` exists and covers: one-paragraph description of what the tool is and does; link to `CONTEXT.md` for domain vocabulary; link to `docs/` for ADRs and specs; prerequisites (`mise`, Docker, Node via mise); step-by-step dev setup (`mise install`, `npm install`, `cp .env.example .env`, `npm run db`, `npm run dev`); Docker Compose instructions (`docker compose up`); complete env var reference with descriptions and defaults; a note that implementation tickets live in `.scratch/news-triangulator/issues/` and that each implementing agent is expected to check off acceptance criteria and mark the ticket done on completion
- [x] An initial git commit is made containing all scaffold files
