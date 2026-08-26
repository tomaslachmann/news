# 76 — Wire `kind: 'line'` chart into the Thread page

**Type:** feature

**What to resolve:** Follow-up from ticket 72's grilling session. Consumes ticket 75's claim-series
data to render a real day-over-day trend chart on the Thread page, using ticket 73's `chart`
`NarrativeBlock` type (`kind: 'line'`) and Recharts `LineChart`. This is the original use case ticket
65's design reference wanted (e.g. a budget balance narrowing from 52bn to 18bn CZK over six days).

**Blocked by:** 75 (needs real series data), 73 (needs the `chart` block type/renderer to exist).

**Status:** ready-for-agent

- [ ] Thread page's Narrative generation (or thread-detail assembly, whichever produces the
      `NarrativeDocument`/blocks the Thread page renders): when ticket 75's API reports a `ClaimSeries`
      with enough points to be worth showing, place a `chart` block with `kind: 'line'` referencing
      that series.
- [ ] `NarrativeArticle.tsx`'s `chart` case (added in ticket 73): extend to handle `kind: 'line'` —
      render via Recharts `LineChart`, x-axis = date, y-axis = value, labeled with the series' `unit`.
- [ ] Decide and document the "worth showing" threshold (e.g. minimum 3 linked points) — a 1- or
      2-point series is not a trend.
- [ ] Tests: rendering a `kind: 'line'` chart block from real series data; the "worth showing" threshold
      logic.
- [ ] Manually verify against the real dev Postgres once ticket 75 has produced at least one real
      multi-point series (may need to wait for real Thread data with enough days/members).
- [ ] Typecheck + full test suites pass. `/code-review` clean.
