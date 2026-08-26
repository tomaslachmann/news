# 73 — Implementation: chart `NarrativeBlock` type

**Type:** feature

**What to resolve:** Follow-up from ticket 66's grilling session. Adds a `chart` variant to
`NarrativeBlock` (ADR 0034) so a Narrative document (Article or Thread) can render a chart
comparing what each source reported for one numeric claim — hybrid mechanism: the LLM decides
whether/where to place the block and authors a caption, but the chart's data is a reference to an
existing `NarrativeValueRef`, never LLM-invented numbers. Ships with Recharts as the charting
library.

**Blocked by:** none — uses only `NarrativeValueRef.sourceIds`/`normalizedValue`, which already
exist; does not need ticket 72's claim-tracking-over-time capability.

**Status:** done

- [x] `packages/frontend`: add `recharts` dependency (3.9.0+, React 19-compatible).
- [x] `packages/shared/src/index.ts`: extend the `NarrativeBlock` union with a `chart` variant —
      `kind: 'bar' | 'line' | 'scatter' | 'pie'`, a caption (`NarrativeInline[]`, LLM-authored, same
      as other blocks' text), and a reference to the backing `NarrativeValueRef`s. Only `'bar'` needs
      to actually render real data in this ticket; the other three kinds exist in the type now so
      ticket 72's future `'line'` consumer (and any later `'scatter'`/`'pie'` consumer) doesn't
      require another union change.
- [x] `narrativeDocument.ts`'s `verifyNarrativeDocumentOrThrow` (and `findNarrativeVerificationFailures`):
      add a dangling-reference check for `chart` blocks' value references, same shape as the
      existing entity/source/value ref checks — throws (retry-once-then-fail-the-job) on a `chart`
      block citing a value id that doesn't resolve, consistent with the rest of that function's
      no-drop-one-bad-block contract. Also added (found by `/code-review`, see notes): at-least-two-
      distinct-values and same-unit checks.
- [x] Narrative generation prompt/schema (wherever `heading`/`paragraph`/`quote`/`list` are
      currently described to the LLM): teach it about the new `chart` block — when two or more
      sources report different figures for the same claim, it may place a `kind: 'bar'` chart block
      referencing those values' ids.
- [x] `packages/frontend/src/components/NarrativeArticle.tsx`: add a `chart` case to the block
      `switch`, rendering via Recharts (`BarChart` for `kind: 'bar'`); replace the current bare
      `default` fallthrough-to-paragraph with an explicit `never`-exhaustiveness check so an
      unhandled future variant is a compile error here, not a silent mis-render.
- [x] Wire the source-comparison chart into `ArticlePage`'s Narrative renderer (see notes — the
      Thread page has no `NarrativeDocument` to wire into yet).
- [x] Tests: `narrativeDocument.test.ts` covering the new dangling-ref/distinct-count/unit checks;
      `narrativeChart.test.ts` covering the chart's data-prep logic (see notes on why this replaces
      a `NarrativeArticle.test.ts` component-render test).
- [x] Typecheck + full test suites pass. `/code-review` clean.

## Implementation notes

**Did not reuse a single `valueId` as ticket 66's Answer literally specified — used `valueIds:
string[]` instead.** A single `NarrativeValueRef` only ever carries one canonical figure; its
`sourceIds` are corroborating sources for that *same* number, not differing reports. A chart
"comparing what each source reported" needs two or more *distinct* value refs (e.g. the two
conflicting figures of a `contradiction`), never one ref's own source list — a chart over a single
ref would just be N identical bars. `valueIds: string[]` generalizes cleanly to ticket 72's future
`'line'` trend case too (an ordered list of value refs across days is the same shape).

**`/code-review` (medium) findings, both fixed:** (1) verification checked that `valueIds` resolve
to declared `valueRefs`, but never that they share the same unit — an LLM chart could otherwise plot
a death toll against a currency amount on the same axis with no unit shown, an unearned equivalence
this project's core premise (never misrepresenting what happened) exists to avoid. Fixed: verification
now runs each cited value's text through the same deterministic `parseCzechNumeralValue` used at
build time and fails if the resulting units differ. (2) Nothing enforced the prompt's own contract
that a chart needs at least two distinct figures — a one-id or duplicate-id chart passed verification
and either silently dropped the LLM's caption (rendering nothing) or showed two identical bars. Fixed:
verification now fails when `valueIds` doesn't contain at least two distinct ids. Also updated
CONTEXT.md's Narrative entry (flagged by the same review round) to mention the new `chart` block type.

**Thread page has no `NarrativeDocument` to wire into.** The ticket assumed (from ticket 65/66's
framing) that the Thread page already renders a Narrative like `ArticlePage` does. It doesn't — the
Thread page shows aggregated real data (chronology, articles table, sources/entities rails) with no
generated Cross-Source Narrative prose. Only `ArticlePage.tsx` uses `NarrativeArticle`, so the chart
ships wired there; it becomes available on the Thread page automatically whenever a future ticket
gives Thread its own `NarrativeDocument`, or ticket 76 renders one directly.

**No `NarrativeArticle.test.ts` component-render test.** This frontend's existing test suite
(`chromeNav.test.ts`, `narrativeRefs.test.ts`, `homePageViewModel.test.ts`, etc.) is entirely
pure-logic — `vitest.config.ts` runs `environment: 'node'`, and there's no React Testing
Library/jsdom dependency anywhere in the project. Rather than introduce new test infrastructure for
this one component, extracted the chart's data-prep (`valueIds` → Recharts-ready `{ label, value }`
points, dropping unresolved/unparseable entries) into a pure function
(`packages/frontend/src/lib/narrativeChart.ts`) and tested that directly, matching the project's
existing convention.
