# 76 — Wire `kind: 'line'` chart into the Thread page

**Type:** feature

**What to resolve:** Follow-up from ticket 72's grilling session. Consumes ticket 75's claim-series
data to render a real day-over-day trend chart on the Thread page, using ticket 73's `chart`
`NarrativeBlock` type (`kind: 'line'`) and Recharts `LineChart`. This is the original use case ticket
65's design reference wanted (e.g. a budget balance narrowing from 52bn to 18bn CZK over six days).

**Blocked by:** 75 (needs real series data), 73 (needs the `chart` block type/renderer to exist).

**Status:** done

## Implementation notes

**The `chart` `NarrativeBlock` mechanism (ticket 73) doesn't apply here at all — confirmed, not just
assumed.** That mechanism is specifically for an LLM-authored `NarrativeDocument` (an Article/
Analysis's Cross-Source Narrative): the LLM decides whether/where to place a chart block and authors
its caption. The Thread page renders no such document — re-confirmed by reading `ThreadPage.tsx`
directly (chronology, articles table, sources/entities/open-questions rails, all plain data-driven
sections, no `NarrativeArticle` import anywhere). So this ticket's line chart is a plain Thread-page
section reading `ThreadDetail.claimSeries` (ticket 75) directly — no block type, no LLM-authored
caption, no `NarrativeArticle.tsx` changes at all. Reused `NarrativeArticle.css`'s `.nchart`/
`.nchart__cap` classes purely for visual consistency with ticket 73's bar chart, not because this
goes through that component.

**Manual verification against the real dev Postgres was not achievable, on two independent axes**:
(1) the dev DB's one real `Thread` row (`memberCount: 2`) doesn't clear the visible-member threshold
— `GET /api/thread/:slug` 404s ("Vlákno nenalezeno"), so there is no real Thread page to load at all
right now, let alone one with a multi-point `ClaimSeries` (which needs real Thread data spanning
several days with a genuinely re-reported numeric claim — something that doesn't exist yet); (2) no
browser/Playwright tooling is available in this environment to visually drive the frontend even if a
real page existed. Did what verification was actually possible instead: confirmed via `curl` that
`GET /api/threads`/`GET /api/thread/:slug` behave as expected against the current (empty/below-
threshold) dev DB state, and relied on typecheck + the `trendWorthyClaimSeries` unit tests for the
new logic's correctness.

- [x] ~~Thread page's Narrative generation... place a `chart` block with `kind: 'line'`~~ — N/A, see
      Implementation notes: the Thread page has no `NarrativeDocument` of its own to place a block in
      at all (ticket 73's own finding). Renders directly from `ThreadDetail.claimSeries` instead,
      bypassing the `chart` `NarrativeBlock` mechanism entirely.
- [x] New `ThreadTrendChart`/`ThreadTrendCharts` components (`ThreadPage.tsx`): Recharts `LineChart`
      per trend-worthy series, x-axis = date, y-axis = value, captioned with the series' `unit`
      (reuses `NarrativeArticle.css`'s `.nchart`/`.nchart__cap`, same cross-page CSS reuse convention
      `ThreadPage.tsx` already uses for `AnalysisPage.css`/`HomePage.css`).
- [x] "Worth showing" threshold: `MIN_POINTS_FOR_TREND = 3` (`threadPageViewModel.ts`'s
      `trendWorthyClaimSeries`), documented inline — a 1- or 2-point series is just a couple of
      numbers, not a trend a chart earns its place for.
- [x] Tests: `trendWorthyClaimSeries` threshold logic (boundary at exactly 3, mixed lists, empty
      input). No component-render test for the chart itself — this frontend has no such
      infrastructure (`environment: 'node'`, no RTL/jsdom — see ticket 73's own Implementation
      notes); the pure threshold logic is what's actually tested, same convention.
- [x] Manually verify against the real dev Postgres — did what was actually possible (see
      Implementation notes): full visual/browser verification was not achievable this round.
- [x] Typecheck + full test suites pass. `/code-review` clean.
