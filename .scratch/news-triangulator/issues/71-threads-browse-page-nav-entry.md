# 71 — `/threads` browse-all list page + nav entry

**Type:** feature

**What to resolve:** Follow-up from ticket 65's grilling session. A `/threads` list page playing
the same "browse everything" role for Threads that `/history` already plays for Articles, plus a
real, working nav entry pointing to it — unlike this site's existing dead rubric placeholders
(`Domácí`/`Ekonomika`/... in `chromeNav.ts`, all `to: '#'`).

**Blocked by:** 68 (reuses its visible-member gate and row shape; does not need its single-thread
route).

**Status:** done

- [x] Backend: paginated Thread listing (reuse `fetchPage`/`Page<T>`, this codebase's existing
      pagination convention — see `pagination.ts`), ordered by `lastEventAt` DESC, includes
      `ACTIVE`/`DORMANT`/`CLOSED` (all three — a closed arc is still worth reading), gated to
      Threads with at least 2 currently-visible members. New route, e.g. `GET /api/threads`, public.
- [x] Frontend: new route `/threads`, new `ThreadsPage.tsx` (or similar), same row shape as ticket
      70's homepage teaser (title, member count, updated-relative-time), paginated the same way
      `HistoryPage.tsx` already is.
- [x] `chromeNav.ts`: add a real "Vlákna" entry to `getPrimaryNavItems` pointing at `/threads` —
      alongside `Historie`/`Hledat`, not mixed into the dead rubric placeholder list.
- [x] Tests: pagination/ordering test for the new backend query.
- [x] Typecheck + full test suites pass. `/code-review` clean.

## Implementation notes

**Did not reuse `fetchPage`/`Cursor` as literally specified.** `pagination.ts`'s keyset cursor is
hardcoded to a `(createdAt, id)` tuple — `Thread` has no `createdAt` column, and (per ticket 70)
the visibility gate that decides ranking in the first place can't be expressed as a SQL
`where`/`orderBy` anyway, since it depends on each member's own Analysis status several joins deep.
Reusing the keyset system would have meant fabricating a fake `createdAt` onto a model that
genuinely doesn't have one. Instead, `getThreadsPage` (`threadDetailService.ts`) uses a plain
offset into `findVisibleThreadsRanked`'s already-fully-fetched, in-memory-sorted array, encoded the
same "opaque to the client" way the keyset cursor is. Kept the shared `Page<T>` *response* shape
and `ListQuerySchema` query-param validation exactly as every other paginated endpoint uses — only
the cursor's internal encoding differs, which is invisible to any caller.

**Refactored ticket 70's `rankVisibleThreads`/row type out of `repositories/homepageStats.ts` and
into `repositories/thread.ts`** (renamed `HomepageRecentThreadRow` → `VisibleThreadRankRow`, moved
its unit tests from the now-deleted `homepageStats.test.ts` to a new `thread.test.ts`), so both
ticket 70's homepage rail and this ticket's browse-all listing share one "which Threads are
visible, ranked" implementation instead of duplicating it or having the general `thread.ts` repo
depend on the homepage-specific `homepageStats.ts` (backwards layering). `findHomepageRecentThreadRows`
stays in `homepageStats.ts` as a thin `.slice(0, limit)` wrapper — pure behavior-preserving move,
confirmed by the full existing test suite passing unchanged.

Reused `HomepageThreadItem` as the browse-all list's row type too, rather than inventing a second,
near-identical shared type — the two surfaces show exactly the same fields. The name is a little
stale now (no longer homepage-only) but renaming would churn already-shipped ticket 70 code for a
cosmetic reason; left as a known minor imprecision rather than fixed here.

Manually smoke-tested against the real dev Postgres: `GET /api/threads` returns
`{"items":[],"nextCursor":null}` (correctly excluding the one real Thread there, below the
visibility threshold — consistent with tickets 68/69/70's own smoke-test findings), and an invalid
`cursor` query param correctly 400s with "Neplatný cursor" rather than silently defaulting to page
one.
