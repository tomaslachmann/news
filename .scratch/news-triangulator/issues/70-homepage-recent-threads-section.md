# 70 — Homepage "recently updated Threads" section

**Type:** feature

**What to resolve:** Follow-up from ticket 65's grilling session. A small homepage rail
highlighting the most-recently-updated Threads — no design precedent for this (the reference
design's homepage template has nothing thread-related), modeled on this session's own recent
compact homepage rails (ticket 61's "Nejčtenější").

**Blocked by:** 68 (reuses its visible-member-count gate; does not need its route/mapper, this is
a new, smaller query).

**Status:** ready-for-agent

- [ ] `packages/backend/src/repositories/homepageStats.ts` (or a new `homepageThreads.ts` read-model
      repository, per ADR 0037 — same call as ticket 62's `homepageArticles.ts` precedent):
      `findHomepageRecentThreads(limit)` — Threads ordered by `lastEventAt` DESC, filtered to those
      with at least 2 currently-visible (COMPLETE) members.
- [ ] `packages/shared/src/index.ts`: `HomepageThreadItem` (slug, title, memberCount,
      lastEventAt/updated-relative-time input, ...).
- [ ] `packages/backend/src/services/homepageThreadsService.ts` (or extend
      `homepageStatsService.ts`): `getHomepageRecentThreads()`, limit 3 (per ticket 65's Answer).
- [ ] `GET /api/homepage/threads` (or fold into an existing homepage route file), public.
- [ ] Frontend: `useHomepageRecentThreads()` hook + a `RecentThreadsSection` component on
      `HomePage.tsx`, each row linking to `/thread/:slug` (ticket 69's route).
- [ ] Tests: service + mapper tests for the ordering/visibility-gate logic.
- [ ] Typecheck + full test suites pass. `/code-review` clean.

## Implementation notes

*Fill in once built.*
