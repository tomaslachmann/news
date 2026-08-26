# 70 — Homepage "recently updated Threads" section

**Type:** feature

**What to resolve:** Follow-up from ticket 65's grilling session. A small homepage rail
highlighting the most-recently-updated Threads — no design precedent for this (the reference
design's homepage template has nothing thread-related), modeled on this session's own recent
compact homepage rails (ticket 61's "Nejčtenější").

**Blocked by:** 68 (reuses its visible-member-count gate; does not need its route/mapper, this is
a new, smaller query).

**Status:** done

- [x] `packages/backend/src/repositories/homepageStats.ts` (or a new `homepageThreads.ts` read-model
      repository, per ADR 0037 — same call as ticket 62's `homepageArticles.ts` precedent):
      `findHomepageRecentThreads(limit)` — Threads ordered by `lastEventAt` DESC, filtered to those
      with at least 2 currently-visible (COMPLETE) members.
- [x] `packages/shared/src/index.ts`: `HomepageThreadItem` (slug, title, memberCount,
      lastEventAt/updated-relative-time input, ...).
- [x] `packages/backend/src/services/homepageThreadsService.ts` (or extend
      `homepageStatsService.ts`): `getHomepageRecentThreads()`, limit 3 (per ticket 65's Answer).
- [x] `GET /api/homepage/threads` (or fold into an existing homepage route file), public.
- [x] Frontend: `useHomepageRecentThreads()` hook + a `RecentThreadsSection` component on
      `HomePage.tsx`, each row linking to `/thread/:slug` (ticket 69's route).
- [x] Tests: service + mapper tests for the ordering/visibility-gate logic.
- [x] Typecheck + full test suites pass. `/code-review` clean.

## Implementation notes

Extended the existing `repositories/homepageStats.ts`/`mappers/homepageStats.ts`/
`services/homepageStatsService.ts` files rather than creating new `homepageThreads.*` ones — this
codebase's other homepage read-models (minute feed, contradictions, entity stats, most-read) all
already live together in these three files, and Thread's own query doesn't need enough machinery
to justify a fourth home for it.

Visibility (>= 2 currently-COMPLETE members) can't be expressed in the Prisma `where` clause — it
depends on each member's own Analysis status, several joins deep — so `findHomepageRecentThreadRows`
over-fetches (`RECENT_THREADS_FETCH_MULTIPLIER = 5`) ordered by `lastEventAt` DESC, then
filters/truncates to `limit` in memory. Same reasoning ticket 68's own service-layer gate uses, just
applied across a page instead of a single row.

Used absolute dates (`formatDate`) for "last updated," not genuine relative time ("před 2 hodinami")
— no relative-time formatter exists anywhere in this frontend yet, and building one is out of scope
for a single homepage rail; ticket 65's Answer mentioned "relative time" loosely, not as a hard
requirement.

No dedicated `mappers/homepageStats.test.ts` exists for this file's other mapper functions either
(`toHomepageMostReadItem`, `toHomepageMinuteItem`, ...) — `toHomepageThreadItem` follows that same
convention, exercised indirectly via the service test rather than a standalone mapper test file.
Likewise, no repository-level test (unit or integration) exists for this file's sibling functions
(`findHomepageMostReadRows`, etc.) — followed that convention too, rather than introducing a new
testing layer just for this one addition.

Manually smoke-tested `GET /api/homepage/threads` against the real dev Postgres: returns `[]`,
correctly excluding the one real Thread there (1 COMPLETE + 1 still-DRAFT member, below the
visibility threshold) — matches ticket 68/69's own smoke-test finding about current dev-DB state.

**`/code-review` (high) findings, all fixed:** (1) the rail sorted/displayed by the raw
`Thread.lastEventAt` instead of only-visible-members' own span — same class of leak ticket 68's
own first review round caught, fixed the same way (derive from visible members). (2) No
deterministic tiebreak for equal timestamps — added slug-ascending as the secondary sort key. (3)
The `RECENT_THREADS_FETCH_MULTIPLIER` over-fetch-then-filter approach could silently drop a
genuinely-visible Thread that sorted past the cutoff — removed the multiplier entirely; the query
now fetches every Thread unbounded (matches this codebase's existing "small table, scan outright"
judgment for `findEntityMentionsForStory`) and does the filter/sort/limit in memory. Extracted that
in-memory logic into a pure `rankVisibleThreads` function, directly unit-tested (6 new tests) rather
than left implicit in the exported repository function. (4) `RecentThreadsSection` unmounted itself
entirely on a genuinely-empty rail, contradicting its own doc comment — fixed to render an
empty-state message, matching `MostReadSection`'s existing pattern.
