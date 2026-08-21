# 49 — Pagination for the Additions queue on `/admin/ingestion`

**What to build:** `PendingAdditionsSection` on `IngestionReviewPage` (the "Možná doplnění k
dokončeným článkům" queue) currently loads every `PendingAddition` row unbounded —
`GET /api/admin/ingestion/pending-additions` has no cursor/limit and
`findAllPendingAdditions`/`listPendingAdditions` return the full table. The other two queues on
this page already have bounded shapes: `DraftsSection` is cursor-paginated (`findDraftsPage`,
ticket 03/ADR — `ListQuerySchema`, `Page<T>`, `usePaginatedQuery` + `LoadMoreButton`) and
`StoryRelationsSection` is a small, naturally-bounded admin-confirmation queue. Bring Additions in
line with the Drafts pattern.

**Blocked by:** none.

**Status:** ready-for-agent

- [ ] `findPendingAdditionsPage(cursor, limit)` (or equivalent) in `pendingAddition.ts`, replacing
      `findAllPendingAdditions`'s unbounded `findMany` with the same keyset `(createdAt, id)`
      pagination `findDraftsPage` already uses.
- [ ] `GET /api/admin/ingestion/pending-additions` accepts `cursor`/`limit` via `ListQuerySchema`
      (mirroring the `/api/admin/ingestion/drafts` route) and returns `Page<PendingAdditionItem>`
      instead of a bare array.
- [ ] `fetchPendingAdditions` takes a cursor and returns `Page<PendingAdditionItem>`;
      `usePendingAdditions` becomes a paginated hook via the existing `usePaginatedQuery` helper
      (`services/pagination.ts`), same shape as `useVisibleDrafts`.
- [ ] `PendingAdditionsSection` renders a `LoadMoreButton` when `hasNextPage`, matching
      `DraftsSection`'s existing markup/behavior.
- [ ] Approve/reject mutations' cache invalidation (`usePendingAdditionDecision`) still works
      against the paginated query key.
- [ ] Existing tests for `findAllPendingAdditions`/the pending-additions route/hook updated for the
      new paginated shape; a pagination test added if `findDraftsPage`'s own integration test
      (`test/integration/pagination.test.ts`) is the right place to extend rather than duplicate.

## Notes

`StoryRelationsSection` (the third queue) is unbounded too, but the user's comment named only the
Additions queue ("under additions parts") — leave `StoryRelationsSection` as-is unless it turns out
to share code that makes doing both trivially cheap.
