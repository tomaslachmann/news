# 69 — Thread detail frontend page

**Type:** feature

**What to resolve:** Follow-up from ticket 65's grilling session. The reader-facing `/thread/:slug`
page consuming ticket 68's endpoint — header, `daystats` strip, chronology timeline, per-outlet
article table, sources rail, entities rail, mock/placeholder open-questions rail, explainer box.
No trend chart (ticket 66, unresolved, out of scope here).

**Blocked by:** 68.

**Status:** ready-for-agent

- [x] `packages/frontend/src/services/thread/` — `fetchThreadDetail(slug)` + `useThreadDetail(slug)`
      hook, same shape as this session's other read-model services (e.g. `services/homepageStats`).
- [x] New route `/thread/:slug` in `App.tsx`, new `ThreadPage.tsx`.
- [x] Header: `<h1>` title only (no perex, matches `ArticlePage.tsx`'s own real precedent) + byline
      (opened date, updated date, average-agreement gauge/chip) — no fake category kicker.
- [x] `daystats`-style strip: real numbers only — opened, member count, source count, average
      agreement %, "Rozpory" (contradiction count, no "otevřené" framing), last updated.
- [x] Chronology timeline: member-granularity, oldest/newest toggle, each item = headline+link
      (`articlePath`), `eventTime`, source count, agreement gauge, `agreementCategory` chip. No
      "what changed" prose, no mark/breakthrough badges (not real).
- [x] "All articles" table: Coverage-granularity, each row = outlet, date, title+link, and chips for
      every tag `ThreadArticleRow.tags` carries (agrees/contradicts/unique/none) — reuse this
      codebase's existing dimension-chip styling, not a fabricated percentage.
- [x] Sources rail: outlet + real Coverage count, no invented role text.
- [x] Entities rail: reuse the existing entity-rail rendering pattern (`AnalysisPage`/`ArticlePage`
      already has one) against the aggregated list from ticket 68.
- [x] Open-questions rail: ships now with placeholder/mock content, visibly marked in a code comment
      (not `import.meta.env.DEV`-gated — no real readers of this deployment yet) as awaiting ticket
      67; must not be presented as if it were computed from real data.
- [x] Explainer box ("Jak vlákno vzniká"): real copy describing `ACTIVE`/`DORMANT`/`CLOSED` +
      `thread.recompute`, not the mockup's invented rules.
- [x] `ArticlePage.tsx`'s existing `ThreadSection` heading ("Součást vlákna: {title}") becomes a
      link to `/thread/:slug` using the `slug` ticket 68 added to `ThreadSummaryItem`.
- [x] Tests: component/viewmodel tests for the attribution-tag chip rendering and the oldest/newest
      toggle at minimum.
- [x] Typecheck + full frontend test suite pass. Manually smoke-tested against real dev-DB data (no
      headless-browser tool available in this environment — noted explicitly, not skipped silently).
      `/code-review` clean.

## Implementation notes

No React component-rendering test infrastructure exists anywhere in this frontend yet (only pure
viewmodel/logic tests, e.g. `homePageViewModel.test.ts`) — rather than introduce a new testing
paradigm unrequested, extracted the two genuinely-testable pieces of logic (which `daystats` tiles
appear, and the oldest/newest reordering) into `threadPageViewModel.ts`/`.test.ts`, same convention
`homePageViewModel.ts` already established. The attribution-tag→chip mapping in `ThreadPage.tsx`
itself is a plain `Record` lookup (TypeScript already enforces exhaustiveness); the actual
attribution-matching logic it displays is backend logic, already covered by
`mappers/threadDetail.test.ts` (ticket 68).

No day-grouping in the chronology timeline (unlike the reference design's `.tl__day` headers) —
this Thread's timeline is member-granularity (typically a handful of entries), not the reference's
dozens of per-outlet events, so day headers would add structure without benefit; dropped that CSS
block when porting `.tl`/`.qa`/`.artable` into the new `ThreadPage.css`.

Manually smoke-tested end-to-end against the real dev Postgres: no thread in the dev DB currently
has 2 visible (COMPLETE) members (the one real Thread there has 1 COMPLETE + 1 still-DRAFT member,
correctly 404ing), so a throwaway script (`src/scripts/tmpSmokeTestThread.ts`, deleted after)
created a real 2-member COMPLETE thread via the actual repository functions, confirmed
`GET /api/thread/:slug` returns a correctly-shaped `ThreadDetail` with real attribution-tag
matching working end-to-end, then cleaned up every row it created. No headless-browser tool is
available in this environment, so the page's actual visual rendering wasn't screenshotted — this
limitation is disclosed, not silently skipped.

**`/code-review` (high) findings, all fixed:** (1) `ThreadTimeline`'s per-member Gauge rendered
unconditionally instead of gating on `MIN_SOURCES_FOR_GAUGE` like every other gauge in this
codebase (`AnalysisByline`) — fixed. (2) The header was missing a byline entirely, even though the
checklist said "done" — added `ThreadByline` (opened/updated dates + average agreement as plain
text, deliberately no Gauge/chip for that average since it has no backend-computed tier of its own
— inventing an ok/mid/bad boundary for it client-side would be exactly the ADR-0030 violation the
first finding was about). (3) `fetchThreadDetail` treated every non-ok response identically, so the
backend's deliberate 404 (unknown slug or <2 visible members) and a genuine fetch failure both hit
`isError`, and `ErrorState` (implying "try again") always won over the intended `NotFoundPage` —
added a `ThreadNotFoundError` class thrown specifically on `res.status === 404`, checked in
`ThreadPage.tsx` before falling back to `ErrorState`.
