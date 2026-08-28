# 88 — Real pagination + backend sort/filter for admin queues

**Type:** feature

**What to resolve:** User ask (verbatim, translated): "we'll need better pagination on the admin,
normal paging, plus backend sort and filtering." Today every admin queue (Ingestion review Drafts,
Pending Additions, Story Relations) is cursor-based infinite-scroll only, with no sort or filter
controls anywhere in the UI.

**Research done before filing this ticket** (2026-08-27, confirmed by reading the actual code):

- Frontend: `useVisibleDrafts()` and the equivalent hooks for Pending Additions use React Query's
  `useInfiniteQuery`, exposing `fetchNextPage`/`hasNextPage`/`isFetchingNextPage` — no page-number
  UI, no way to jump to a specific page, no sort/filter form anywhere on `IngestionReviewPage.tsx`.
- Backend: `findDraftsPage(minVisibleSourceCount, cursor, limit)`
  (`repositories/analysis.ts`) — fixed `ORDER BY a."createdAt" DESC, a.id DESC`, keyset pagination
  via `keysetSqlWhere(cursor)`, no sort parameter, no filter parameter beyond the hardcoded
  `status = 'DRAFT'` and the `HAVING` visibility threshold. `findPendingAdditionsPage` follows the
  same shape. Neither function takes anything resembling a sort column or a filter predicate today
  — adding either is new surface, not wiring up something already there but unused.

**Blocked by:** none.

**Status:** todo

- [x] Scope decision needed before implementation: which admin queue(s) get this first (Ingestion
      Drafts is the one the user hit, but Pending Additions and Story Relations share the same
      cursor-only shape) — probably worth doing consistently across all three rather than just one,
      per this session's own "wire a new capability into every fitting consumer" convention, but
      confirm with the user before committing to that scope given it roughly triples the surface.
      → User chose **all three** queues.
- [x] Design the pagination shape: real page-number pagination (offset-based, with a total count)
      vs. keeping cursor-based fetching but adding page-number UI on top (jump-to-page against a
      keyset scheme is awkward — usually means switching to offset pagination for these admin
      queues specifically, accepting the performance trade-off since these are bounded admin queues,
      not public high-traffic listings).
      → **Offset pagination** with a real total (user's choice). `PagedResult<T>` shape, distinct
      from the keyset `Page<T>`. Recorded in ADR 0039; glossary entry "Admin Ingestion queue".
- [x] Backend: add sort (which columns make sense — createdAt, coverageCount, source name?) and
      filter (status, source, date range?) parameters to the relevant repository query functions —
      needs its own design pass on exactly which fields matter for an Admin triaging these queues,
      not guessed.
      → createdAt direction (all three), coverageCount sort (Drafts only), outlet-substring filter
      (Drafts + Pending Additions), created-at range (all three). Per-queue zod schemas over a
      shared base. `findDraftsPage` / `findPendingAdditionsPage` /
      `findPendingReviewRelationsPage` now offset+total with those params.
- [x] Frontend: real pagination controls (page numbers, not infinite scroll) plus sort-column
      headers and a filter form, wired to the new backend parameters.
      → `AdminPagination` (page numbers + range label), `AdminQueueControls` (sort select + outlet
      + date range), `usePagedQuery` (keepPreviousData). All three sections on
      `IngestionReviewPage` wired; changing a filter resets to page 1.
- [x] Tests: repository-level tests for each new sort/filter combination; route-level tests for
      parameter validation (bad sort column, bad filter value); frontend tests for the new controls.
      → Integration: offset+total, coverageCount sort, outlet filter, date-range for drafts;
      offset+total+dir for additions and relations. Unit: service-layer offset/pageCount/filter
      forwarding for all three. Zod schemas reject bad sort/dir/page at the route via
      `parseAdminQuery` (→ 400). Frontend: `buildPageList` / `pageRangeLabel` / `adminQueryString`
      pure-helper tests.
- [x] Typecheck + full test suites pass. `/code-review` clean.
