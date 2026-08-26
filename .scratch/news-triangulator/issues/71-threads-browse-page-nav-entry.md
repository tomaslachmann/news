# 71 — `/threads` browse-all list page + nav entry

**Type:** feature

**What to resolve:** Follow-up from ticket 65's grilling session. A `/threads` list page playing
the same "browse everything" role for Threads that `/history` already plays for Articles, plus a
real, working nav entry pointing to it — unlike this site's existing dead rubric placeholders
(`Domácí`/`Ekonomika`/... in `chromeNav.ts`, all `to: '#'`).

**Blocked by:** 68 (reuses its visible-member gate and row shape; does not need its single-thread
route).

**Status:** ready-for-agent

- [ ] Backend: paginated Thread listing (reuse `fetchPage`/`Page<T>`, this codebase's existing
      pagination convention — see `pagination.ts`), ordered by `lastEventAt` DESC, includes
      `ACTIVE`/`DORMANT`/`CLOSED` (all three — a closed arc is still worth reading), gated to
      Threads with at least 2 currently-visible members. New route, e.g. `GET /api/threads`, public.
- [ ] Frontend: new route `/threads`, new `ThreadsPage.tsx` (or similar), same row shape as ticket
      70's homepage teaser (title, member count, updated-relative-time), paginated the same way
      `HistoryPage.tsx` already is.
- [ ] `chromeNav.ts`: add a real "Vlákna" entry to `getPrimaryNavItems` pointing at `/threads` —
      alongside `Historie`/`Hledat`, not mixed into the dead rubric placeholder list.
- [ ] Tests: pagination/ordering test for the new backend query.
- [ ] Typecheck + full test suites pass. `/code-review` clean.

## Implementation notes

*Fill in once built.*
