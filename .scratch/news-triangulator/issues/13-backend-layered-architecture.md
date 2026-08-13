# 13 — Backend Layered Architecture

**What to build:** Refactor the backend into the Routes → Services → Repositories → Mappers layering defined in ADR 0010: introduce the repository and mapper layers, typed errors with a centralized handler, Zod-based request validation in `packages/shared`, and migrate the existing `routes/analyses.ts` and `routes/auth.ts` into the new shape. This ticket has no product-facing behavior — all existing endpoints keep their current request/response contracts.

**Blocked by:** 12 — Testing & Quality Infrastructure.

**Status:** done

- [x] `repositories/analysis.ts`, `repositories/coverage.ts`, `repositories/synthesisResult.ts`, and `repositories/user.ts` each wrap that model's `prisma.*` calls; no other file calls `prisma.*` or `db.ts` directly
- [x] An ESLint rule bans importing `db.ts` or `@prisma/client` from anywhere outside `repositories/`
- [x] A `mappers/` directory holds one file per entity (at minimum `coverage.ts`, mapping `Coverage` → `CoverageInfo`), called from services, not routes
- [x] `NotFoundError`, `ValidationError`, and `ExternalServiceError` classes exist and are thrown by services/repositories instead of routes returning `reply.code(...)` manually for these cases
- [x] A single Fastify `setErrorHandler` maps each typed error class to its HTTP status (404, 400, 422 respectively)
- [x] Request body types (`PostAnalysisBody`, `PostDiscoverBody`, `PatchCoveragesBody`, `LoginBody`) become Zod schemas defined in `packages/shared`; each route validates against its schema as the first step and throws `ValidationError` on failure
- [x] `routes/analyses.ts` is refactored so every handler validates, calls exactly one service function, and sends the response — no direct `prisma.*` calls remain in the file
- [x] `routes/auth.ts` is refactored the same way; `bcrypt`/`jwt` logic for login moves into a service (e.g. `services/authService.ts`)
- [x] `GET /analyses/:id/stream` is refactored so the route only sets SSE headers and makes one call to a service function (e.g. `runAnalysisPass(id, { send })`) that owns the full extraction/synthesis orchestration loop
- [x] `POST /api/auth/logout` and any other pure-transport route remain in the route file with no service call, per ADR 0010's exemption
- [x] All existing endpoints' request/response shapes are unchanged — this is a structural refactor, not a behavior change
- [x] Unit tests (per ADR 0007/ticket 12 tooling) cover the new services against mocked repositories; at least one integration test exercises a repository against the real containerized Postgres instance
