# ADR 0007 — Testing strategy: Vitest + testcontainers

## Status
Accepted

## Context
No test runner exists in any package. `mise.toml` already stubs a `test` task (`npm test`), but no package defines that script, so it fails immediately if run. As tickets accumulate — authentication, admin UI, user management — the untested surface area grows without any mechanism to catch regressions.

## Decision
- Vitest is the test runner for both `packages/backend` and `packages/frontend` — it matches the Vite/ESM/NodeNext toolchain already in place, avoiding the config friction Jest would add.
- Integration tests use the `testcontainers` npm package to spin up an ephemeral Postgres instance per run, rather than reusing the `docker-compose.yml` `db` service or mocking Prisma. Each test run gets an isolated database with no dependency on a developer having `docker compose up db` running.
- Integration tests are required only for tickets whose acceptance criteria touch Prisma/the database directly; other tickets are covered by unit tests against mocked boundaries.
- External service boundaries (OpenAI, GDELT, article scraping) are wrapped in thin client modules and mocked at that boundary in unit tests — extending the pattern `llmClient.ts` already established for OpenAI.
- Unit tests are colocated (`foo.test.ts` next to `foo.ts`); integration tests live in a separate `packages/backend/test/integration/**` tree.
- Tests are mandatory in acceptance criteria from ticket 08 onward. Tickets 01–07 are not retrofitted — their untested surface (auth, extraction, synthesis) is still being reshaped by upcoming tickets, so tests written against its current shape would likely be rewritten anyway.

## Consequences
Every integration test run needs a working Docker daemon. `mise run test` therefore stays unit-only and fast; `mise run test:integration` is the explicit, slower, Docker-dependent path (see ADR 0008 for how CI splits these across triggers). Deferring the tickets 01–07 retrofit is a deliberate scope decision, not an oversight — it should be revisited once the untested surface stabilizes.
