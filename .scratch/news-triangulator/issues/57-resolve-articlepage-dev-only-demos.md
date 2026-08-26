# 57 — Resolve ArticlePage DEV-only demo sections

**What to build:** `ArticlePage.tsx` still renders two ad hoc DEV-only sample sections from
`AnalysisPage.devDemos.tsx`: wording comparison and value variants. Unlike `/styleguide`, these are
page-level fake content, not the retained design-system reference. Resolve that debt explicitly:
either back them with real synthesis data or remove them.

**Blocked by:** none.

**Status:** done

- [x] Decide whether each DEV-only section in `AnalysisPage.devDemos.tsx` has a real product future
      on `ArticlePage` or should be removed outright.
- [x] If a section is kept, define the exact real data shape it needs from the current narrative /
      synthesis model and implement that path honestly rather than through hardcoded sample text.
- [x] If a section cannot be backed by current real data without inventing a fake intermediary,
      remove it rather than leaving ad hoc demo content attached to `ArticlePage`.
- [x] Keep `/styleguide` explicitly out of scope; this ticket is about ad hoc page demos, not the
      dev-only design-system reference route.

## Implementation notes (agent, 2026-08-22)

Removed both DEV-only sections outright — neither has a real data source without inventing a fake
intermediary:
- **Wording comparison** (`SAMPLE_QCMP_DEMO`): would need per-claim "same fact, different phrasing
  across sources" structure. `Claim`/`DimensionItem` carry no such field — Extraction produces
  Factual/Attributed/Interpretive statements per Coverage, Synthesis aggregates into the four
  Dimensions, but nothing tracks "these N sources phrased the same fact differently," which is
  exactly what this section would need to render honestly.
- **Value variants** (`SAMPLE_VALS_DEMO`): would need per-source numeric-value extraction with
  provenance (which source said what number, in what unit). `NarrativeValueRef` (ADR 0034) comes
  close but is scoped to values mentioned in the generated Narrative prose, not a standalone
  per-source comparison table — reusing it here would mean inventing a fake table around data
  never meant for this presentation.

Deleted `AnalysisPage.devDemos.tsx` entirely (86 lines, no other consumers) and its two import/
render sites in `ArticlePage.tsx`. `/styleguide` untouched, per scope.

Self-review (`/code-review`) caught ~95 lines of now-orphaned `.vals`/`.qcmp` CSS left behind in
`AnalysisPage.css` (the removed components' only consumers) — removed. `styleguide-content.html`
still documents `.vals`/`.qcmp` as retained design-system reference classes, correctly untouched
(`/styleguide` is explicitly out of scope for this ticket).

Also folded in, while sweeping for demo data at the user's request: two remaining fake `href="#"`
links on the homepage now point at real routes (`Sec`'s "Vše z dneška"/"Archiv" → `/history`,
`EntsPanel`'s "přehled →" → `/search`), and a stale `Gauge.tsx` comment claiming HomePage's gauges
render fabricated sample numbers was corrected — both HomePage gauge call sites have used real
backend data since tickets 58–61.

## Notes

Filed from ticket 54's grilling session on 2026-08-21. The user explicitly chose to keep
`/styleguide` but treat the two `ArticlePage` DEV demos as separate debt rather than letting them
linger by analogy with the styleguide. This ticket exists so that choice is captured as its own
follow-up rather than getting lost inside the homepage real-data work.
