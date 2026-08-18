# 03 — Pagination and request caps

Type: grilling
Status: resolved
Blocked by: none — can start immediately

## Question

Two related findings, both about unbounded work per request:

- **P0-7** — zero pagination/limits anywhere in the backend: `GET /api/analyses` and the draft queue return every row with no cursor or limit; per-row `_count` subqueries; no cap on `customUrls`, Coverage count per Analysis, or Discovery candidate count (which multiplies directly against LLM spend). Audit §8.4/§9.6 proposes keyset (cursor) pagination — not `OFFSET` — plus a materialized `okCoverageCount` and server-side `MAX_PAGE_SIZE`/`MAX_CUSTOM_URLS`/`MAX_COVERAGES_PER_ANALYSIS`/`MAX_DISCOVERY_CANDIDATES`.
- **P0-2** — Ingestion loads two full tables into memory every poll (every 20 minutes, per `scripts/ingestion-cron.mjs`).

Decide:

1. Given current row counts (check actual `Analysis`/`Coverage`/`Story` counts in the dev/prod DB), is this a live problem or a future one? The audit explicitly says to measure on ~50k seeded rows, not today's data — that measurement is part of resolving this ticket.
2. Is keyset (cursor-based) pagination the right shape for both the public `/api/analyses` listing and the admin draft queue, or does the admin queue's small size make simple limits sufficient there?
3. What are the actual cap numbers for `customUrls`, Coverage-per-Analysis, and Discovery-candidate-count? These directly bound worst-case LLM spend per request — pick values, don't just adopt the audit's placeholders (10 / 25 / 40) without checking they match real usage patterns.
4. Does P0-2 need its own fix now (e.g. don't load full tables — query only what's needed per poll), independent of whether the full async job-queue rework (ticket 06) happens?

## Answer

DB was still completely empty (0 rows) — the audit's "measure on ~50k seeded rows" step didn't apply; no real usage data exists to weigh urgency against. User's call, given the project's future-growth framing: build full keyset pagination now rather than deferring, for both the reader-facing History listing and the Admin draft queue.

- **Reader listing (`GET /api/analyses`)**: keyset (cursor) pagination — `(createdAt, id)` tuple comparison, `Page<T> = {items, nextCursor}` (new shared type), `ListQuerySchema` (`cursor`/`limit`, `MAX_PAGE_SIZE = 50`). Frontend: `useAnalysesList` → `useInfiniteQuery`, a "Load more" button on the History page.
- **Admin draft queue (`GET /api/admin/ingestion/drafts`)**: same treatment, but with a real wrinkle — the visibility filter (`coverageCount >= MIN_VISIBLE_SOURCE_COUNT`) used to run in JS *after* the DB fetch, which would make a cursor-paginated page return an inconsistent count once filtered. Fixed by pushing the filter into the query itself as a `HAVING` clause (raw SQL — Prisma's query builder can't express filtering on an aggregated `_count`), so `findDraftsPage` returns a correct, consistent page directly. Covered by a dedicated integration test (`test/integration/pagination.test.ts`) against real Postgres, since raw SQL is exactly the kind of thing mocked unit tests can't actually verify.
- **Request-size caps**: `MAX_CUSTOM_URLS = 10` (shared Zod schema, request-level) and `MAX_COVERAGES_PER_ANALYSIS = 25` (service-level, checked against *active* — non-excluded — Coverage count specifically, not total-ever, so old rejected-candidate churn can't permanently lock an Analysis out of adding genuinely new sources).
- **P0-2**: fixed now, cheaply — `findAllSeedUrls`/`findAllArticleUrls` bounded to a 30-day lookback window (new `Coverage.createdAt` column added for this) instead of scanning the entire table's history on every 20-minute poll.

Implemented on `ticket/audit-03-pagination-and-request-caps`.
