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

**Status:** ready-for-agent

- [ ] `packages/frontend`: add `recharts` dependency (3.9.0+, React 19-compatible).
- [ ] `packages/shared/src/index.ts`: extend the `NarrativeBlock` union with a `chart` variant —
      `kind: 'bar' | 'line' | 'scatter' | 'pie'`, a caption (`NarrativeInline[]`, LLM-authored, same
      as other blocks' text), and a reference to the backing `NarrativeValueRef` by `id` (no inline
      data points). Only `'bar'` needs to actually render real data in this ticket; the other three
      kinds exist in the type now so ticket 72's future `'line'` consumer (and any later
      `'scatter'`/`'pie'` consumer) doesn't require another union change.
- [ ] `narrativeDocument.ts`'s `verifyNarrativeDocumentOrThrow` (and `findNarrativeVerificationFailures`):
      add a dangling-reference check for `chart` blocks' `NarrativeValueRef` id, same shape as the
      existing entity/source/value ref checks — throws (retry-once-then-fail-the-job) on a `chart`
      block citing a value id that doesn't resolve, consistent with the rest of that function's
      no-drop-one-bad-block contract.
- [ ] Narrative generation prompt/schema (wherever `heading`/`paragraph`/`quote`/`list` are
      currently described to the LLM): teach it about the new `chart` block — when a `NarrativeValueRef`
      has multiple `sourceIds` reporting the same claim, it may place a `kind: 'bar'` chart block
      referencing that value's id.
- [ ] `packages/frontend/src/components/NarrativeArticle.tsx`: add a `chart` case to the block
      `switch`, rendering via Recharts (`BarChart` for `kind: 'bar'`); replace the current bare
      `default` fallthrough-to-paragraph with an explicit `never`-exhaustiveness check so an
      unhandled future variant is a compile error here, not a silent mis-render.
- [ ] Wire the source-comparison chart into both `ArticlePage` and the Thread page's Narrative
      renderer (both already render `NarrativeDocument.blocks` through the same `NarrativeArticle`
      component, so this should be automatic once the component handles the new case — confirm no
      per-page special-casing is needed).
- [ ] Tests: `narrativeDocument.test.ts` (or equivalent) covering the new dangling-ref check;
      `NarrativeArticle.test.ts` (or equivalent) covering the `chart` block renders a bar chart from
      a referenced `NarrativeValueRef` and that an invalid reference is impossible to construct
      (type-level) / handled per the verification check (runtime).
- [ ] Typecheck + full test suites pass. `/code-review` clean.
