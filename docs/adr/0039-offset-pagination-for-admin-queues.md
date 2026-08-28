# ADR 0039 — Offset pagination (with sort/filter) for the admin Ingestion queues

## Status
Accepted

## Context
`docs/audit.md` P0-7 made keyset (cursor) pagination the system-wide rule and **explicitly
rejected offset**: "`OFFSET` u `orderBy createdAt desc` mění výsledky, když během listování vznikne
nová analýza — a `OFFSET` musí stejně skenovat zahozené řádky." Every list surface since —
`GET /api/analyses`, `/history`, `/category/:slug`, threads, entity events — is keyset over
`(createdAt, id)`, exposed as an opaque `cursor` and a `Page<T>` (`{ items, nextCursor }`), rendered
as an infinite-scroll "Načíst další" button.

Ticket 88's user ask was the opposite for the three admin Ingestion review queues (Drafts, Pending
Additions, Story Relations): "normal paging, plus backend sort and filtering" — jump-to-page,
a visible total, and server-side sort/filter controls. Keyset pagination structurally cannot offer
jump-to-arbitrary-page or a total without a separate count, and layering page numbers on a keyset
scheme means faking offsets anyway.

The reasons P0-7 rejected offset don't bite here:
- **Scan cost:** these are bounded queues a human works *down* — an admin triaging a review backlog,
  not a public feed over the whole `Analysis` history. `OFFSET` scanning a few hundred skipped rows
  is irrelevant; the public feeds, which can page through thousands, stay keyset.
- **Drift under concurrent inserts:** an admin paging a review queue while Ingestion attaches a new
  Draft is rare, low-stakes (a row shifts by one), and self-correcting on the next page load — very
  different from a reader's endless scroll silently repeating or skipping articles.

## Decision
**The three admin Ingestion queues use offset pagination with a real total; every other list
surface stays keyset (P0-7).** Concretely:

- A distinct shared shape `PagedResult<T>` (`{ items, total, page, pageSize, pageCount }`), separate
  from the keyset `Page<T>` — a consumer can tell at the type level which scheme an endpoint uses.
- Per-queue zod query schemas (`DraftQuerySchema` / `PendingAdditionQuerySchema` /
  `StoryRelationQuerySchema`) sharing a `page`/`pageSize`/`dir`/`createdAfter`/`createdBefore` base,
  each adding only the sort columns and filters that apply to it (`sort=coverageCount` and the
  `outlet` filter are Drafts-only / Drafts+Additions-only, not invented for queues that can't use
  them).
- Sort/filter is server-side: the repository query orders and filters in SQL/Prisma, `total` counts
  the same `where` the page uses. Dynamic SQL fragments are `Prisma.sql` values (parameterised, or a
  fixed keyword literal for `ASC`/`DESC`), never interpolated request input.
- Frontend: `usePagedQuery` (a `useQuery` with `keepPreviousData`) + an `AdminPagination` page-number
  control, replacing `usePaginatedQuery`/`LoadMoreButton` for these queues only.

## Consequences
- `repositories/` list functions now come in two shapes. A keyset one takes a `Cursor` and returns
  `limit + 1` rows; an admin-queue one takes an options bag with `offset`/`limit`/sort/filter and
  returns `{ rows, total }`. The `Page<T>` vs `PagedResult<T>` return type is the tell.
- `total` for the Story-relations queue counts the same `where` as the page, ignoring the
  "either side has no Analysis" skip in `findPendingReviewRelationsPage` — that skip guards a
  structural impossibility (every Story is created with its Analysis in one transaction), the same
  assumption the pre-ticket-88 code already made, so `total` can't drift from the rendered count in
  practice.
- If a future admin queue is added, it follows this ADR (offset) rather than P0-7 (keyset) — the
  "bounded, human-worked queue vs. open-ended public feed" test above is the deciding line.
- Public feeds are untouched: no reader-facing endpoint gains an offset or a total from this work.
