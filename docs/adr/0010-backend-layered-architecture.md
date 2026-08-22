# ADR 0010 — Backend layered architecture: Routes → Services → Repositories → Mappers

## Status
Accepted

## Context
No backend architecture had been formalized. "MVC" was proposed as the default, but doesn't describe anything real here: this is a JSON API behind a separate SPA, so there's no View layer to speak of. Meanwhile `routes/analyses.ts` had already grown to 384 lines — its `PATCH /coverages` handler made six direct `prisma.*` calls, ran multi-step orchestration, and shaped the response all inline; its `GET /stream` handler ran the entire extraction/synthesis loop the same way. `routes/auth.ts` had the same shape: direct `prisma.user.findUnique` calls and inline `bcrypt`/`jwt` logic. Some logic had already been extracted to `services/` (discovery, extraction, synthesis), but the boundary was inconsistently drawn.

## Decision
- **Routes**: validate the request body with a Zod schema (defined in `packages/shared`, replacing hand-written interfaces like `PostAnalysisBody`/`LoginBody`), call exactly one service function, shape and send the response. Routes performing a pure transport action with no domain logic (clearing a cookie, a future health check) are exempt from the "call a service" requirement.
- **Services**: hold business logic and orchestration. Call repositories only — never Prisma directly. Call mappers internally and return wire-shaped DTOs, not raw Prisma entities. Signal failure via typed error classes (`NotFoundError`, `ValidationError`, `ExternalServiceError`), never by returning an HTTP status.
- **Repositories**: one file per Prisma model (`repositories/analysis.ts`, `repositories/coverage.ts`, `repositories/synthesisResult.ts`, `repositories/user.ts`). The only layer permitted to import `db.ts` or `@prisma/client` — enforced by an ESLint rule banning that import outside `repositories/`. A composed, display-specific read surface spanning more than one model (`repositories/homepageStats.ts`, `repositories/homepageArticles.ts`) is a named exception to the one-file-per-model rule — see ADR 0037.
- **Mappers**: a dedicated `mappers/` directory, one file per entity, converting Prisma models to the DTOs defined in `packages/shared`. Called by services, not routes.
- **Errors**: a single Fastify `setErrorHandler` maps each typed error class to its HTTP status. Routes no longer need try/catch or manual `reply.code(...)` branching for expected failure cases.
- The SSE stream route (`GET /analyses/:id/stream`) follows the same one-call rule: a single service function (`runAnalysisStream(id, { send })`) owns the entire extraction/synthesis orchestration loop; the route only sets SSE headers, makes that one call, and closes the connection.
- `plugins/` (Fastify preHandlers like `requireAdmin`) sit outside this chain entirely — cross-cutting middleware, not request-specific business logic, and unaffected by any of the above.
- `routes/analyses.ts` and `routes/auth.ts` are refactored into this shape immediately (ticket 13), not left as debt — the ESLint rule banning `db.ts` imports outside `repositories/` would otherwise fail CI on both files the moment it ships.

## Consequences
Every route becomes small and mechanical: validate, call one service, respond. All business logic and every Prisma query become independently testable behind a repository/service boundary, which is also what ADR 0007's testing strategy assumes — unit tests mock the repository layer rather than Prisma directly, and the testcontainers integration suite exercises the repository layer specifically.

The trade-off is more files and more indirection than the current inline style: a change that today is "edit one route handler" becomes "route → service → repository (→ mapper)" across up to four files. That cost is deliberate — it's what makes each piece independently testable and keeps the "no `prisma` outside `repositories/`" rule mechanically enforceable rather than a convention that erodes the way the pre-ADR-0009 abstraction rule did.
