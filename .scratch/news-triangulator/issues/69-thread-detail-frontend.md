# 69 — Thread detail frontend page

**Type:** feature

**What to resolve:** Follow-up from ticket 65's grilling session. The reader-facing `/thread/:slug`
page consuming ticket 68's endpoint — header, `daystats` strip, chronology timeline, per-outlet
article table, sources rail, entities rail, mock/placeholder open-questions rail, explainer box.
No trend chart (ticket 66, unresolved, out of scope here).

**Blocked by:** 68.

**Status:** ready-for-agent

- [ ] `packages/frontend/src/services/thread/` — `fetchThreadDetail(slug)` + `useThreadDetail(slug)`
      hook, same shape as this session's other read-model services (e.g. `services/homepageStats`).
- [ ] New route `/thread/:slug` in `App.tsx`, new `ThreadPage.tsx`.
- [ ] Header: `<h1>` title only (no perex, matches `ArticlePage.tsx`'s own real precedent) + byline
      (opened date, updated date, average-agreement gauge/chip) — no fake category kicker.
- [ ] `daystats`-style strip: real numbers only — opened, member count, source count, average
      agreement %, "Rozpory" (contradiction count, no "otevřené" framing), last updated.
- [ ] Chronology timeline: member-granularity, oldest/newest toggle, each item = headline+link
      (`articlePath`), `eventTime`, source count, agreement gauge, `agreementCategory` chip. No
      "what changed" prose, no mark/breakthrough badges (not real).
- [ ] "All articles" table: Coverage-granularity, each row = outlet, date, title+link, and chips for
      every tag `ThreadArticleRow.tags` carries (agrees/contradicts/unique/none) — reuse this
      codebase's existing dimension-chip styling, not a fabricated percentage.
- [ ] Sources rail: outlet + real Coverage count, no invented role text.
- [ ] Entities rail: reuse the existing entity-rail rendering pattern (`AnalysisPage`/`ArticlePage`
      already has one) against the aggregated list from ticket 68.
- [ ] Open-questions rail: ships now with placeholder/mock content, visibly marked in a code comment
      (not `import.meta.env.DEV`-gated — no real readers of this deployment yet) as awaiting ticket
      67; must not be presented as if it were computed from real data.
- [ ] Explainer box ("Jak vlákno vzniká"): real copy describing `ACTIVE`/`DORMANT`/`CLOSED` +
      `thread.recompute`, not the mockup's invented rules.
- [ ] `ArticlePage.tsx`'s existing `ThreadSection` heading ("Součást vlákna: {title}") becomes a
      link to `/thread/:slug` using the `slug` ticket 68 added to `ThreadSummaryItem`.
- [ ] Tests: component/viewmodel tests for the attribution-tag chip rendering and the oldest/newest
      toggle at minimum.
- [ ] Typecheck + full frontend test suite pass. Manually smoke-tested against real dev-DB data (no
      headless-browser tool available in this environment — noted explicitly, not skipped silently).
      `/code-review` clean.

## Implementation notes

*Fill in once built.*
