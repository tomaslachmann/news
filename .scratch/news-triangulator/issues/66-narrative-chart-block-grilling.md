# 66 — Grilling: a chart/data `NarrativeBlock` type

**Type:** grilling

**Status:** done

**What to resolve:** Split off ticket 65 (Thread overview page), Q3. That ticket's design
reference wants a chart tracking one specific numeric claim across sources and days (e.g. a budget
balance narrowing from a 52bn to 18bn CZK spread over six days) — but there is no capability
anywhere in this codebase today for the LLM (or any deterministic pass) to identify "the one number
this thread/article is about," extract it per source/per day, and hand it to the frontend as
renderable data. `NarrativeDocument.blocks` (ADR 0034) is a closed union of `heading` / `paragraph`
/ `quote` / `list` — there is no `chart`-shaped (or general data-visualization-shaped) block type,
and no pass in the pipeline computes the kind of structured numeric series this would need.

User's framing, as given: when the Narrative/Article is generated from `blocks` ("parts"),
introduce a new part type that can be a chart or something else — this ticket should treat it as a
general `NarrativeBlock` extensibility question, not just a Thread-specific bolt-on, since the same
capability (a chart part inside a generated document) could plausibly matter for a plain Article's
own Narrative too, not only a Thread page.

Not yet decided:

1. Is this actually a `NarrativeBlock` variant (LLM-authored, subject to `verifyAndRepair`'s
   existing quote/assertion verification machinery), or a different mechanism entirely (e.g. a
   deterministic post-processing pass that computes a chart from already-extracted `ValueRef`s,
   never asking the LLM to invent numbers — matching ADR 0014's "never trust an LLM with a
   computation a deterministic check can verify instead", the same principle `NarrativeValueRef`'s
   `normalizedValue` already follows)?
2. What claim-tracking capability would need to exist upstream before any chart block could be
   populated with real numbers — does `NarrativeValueRef` already carry enough (a value + its
   `sourceIds`) to derive a chart, or does this need a genuinely new extraction concept (the same
   numeric claim tracked across multiple Coverage/Analysis rows over time, which nothing currently
   links together)?
3. Scope: does building this chart-part capability get prioritized specifically because Thread's
   trend-chart wants it (ticket 65), or does it stand on its own roadmap regardless of Thread?
4. If built, does every consumer (`AnalysisPage`/`ArticlePage`'s NarrativeArticle renderer, and any
   future Thread page) need to handle the new block type, or can it degrade gracefully (skip
   unknown block types) for a renderer that hasn't been updated yet?

## Answer

**Grilling session held 2026-08-26.**

Surveyed current state before the session: `NarrativeBlock` (ADR 0034) is a closed union of exactly
`heading`/`paragraph`/`quote`/`list`, all LLM-authored prose verified holistically by
`verifyNarrativeDocumentOrThrow` (dangling entity/source/value refs, verbatim quoting) — never for
correctness of a *computed* value. `NarrativeValueRef` (`packages/shared/src/index.ts`) already
carries a deterministically-parsed `normalizedValue`/`unit` plus `sourceIds` (per ADR 0014's
numeral-normalization principle: never let the LLM compute a number a deterministic pass can
extract instead) — but has no date field, and nothing anywhere links values across different
`Analysis` rows (`Analysis.storyId` is 1:1 with `Story`; each Analysis is an isolated snapshot). The
frontend's `NarrativeArticle.tsx` block renderer already `switch`es with a `default` fallthrough and
no `never`-exhaustiveness guard.

Decisions reached with the user:

- **Mechanism: hybrid.** `chart` becomes a new `NarrativeBlock` variant following the same pattern
  as `quote` — the LLM decides *whether and where* to place one and authors a caption, but the
  block's actual data is a reference-by-ID to a backend-computed value, never LLM-invented numbers.
  Pure-LLM-authored data points would violate the numeric-value principle above; a fully separate
  deterministic-only pass (no LLM placement judgment) throws away real signal about whether a chart
  is even worth showing at that point in the document. `verifyNarrativeDocumentOrThrow` gets a new
  dangling-reference check for it, the same shape as its existing entity/source/value ref checks —
  no new verification paradigm needed.
- **Scope: general, not Thread-only.** Wired into every `NarrativeDocument` consumer that exists —
  `ArticlePage` as well as the Thread page — rather than gated to the one ticket (65) that raised it.
  A capability that's a good fit anywhere it's used doesn't get artificially restricted to its first
  requester.
- **Renderer contract: exhaustive handling.** Every consumer updates together in the same change (add
  a `never`-exhaustiveness check rather than relying on the incidental type error the current
  `default`-falls-to-paragraph case would produce). No graceful-degradation/backward-compat design
  needed — this is a single-deploy project, there's no scenario where one consumer ships the new
  block type while another is still running old code.
- **Ships now, with a real consumer: source-comparison chart.** `NarrativeValueRef.sourceIds`
  already links one value to multiple sources *within a single Analysis* — a chart comparing what
  each source reported for the same claim needs zero new upstream capability and can reference an
  existing `NarrativeValueRef` directly. This ships as part of the implementation ticket below,
  in both Article and Thread contexts.
- **Out of scope, split off: claim-tracking-over-time.** The Thread trend-chart use case that
  originally motivated this (a claim's value across multiple *days*) needs a genuinely new
  capability — nothing links a `NarrativeValueRef` across different Analyses/days today, and
  deciding what makes two values from different Analyses "the same underlying claim" is itself a
  substantial, unresolved design question. Spun into its own grilling ticket (72) rather than
  bundled into this session's answer.
- **Library: Recharts.** SVG-based (consistent with this codebase's other pure-SVG/DOM components,
  inspectable/testable with RTL/vitest, unlike canvas-based alternatives), confirmed React
  19-compatible as of its 3.9.0 release. No charting library existed in the frontend before this.
- **Chart kinds:** the block schema carries `kind: 'bar' | 'line' | 'scatter' | 'pie'`. Only `'bar'`
  has a real consumer today (source-comparison); the others become usable as real consumers appear —
  `'line'` once ticket 72 delivers time-series tracking.

Follow-up tickets filed from this session:

- **72 — Grilling: claim-tracking-over-time capability.** How a single numeric claim gets identified
  and linked across a Thread's multiple member Analyses over days, so a real day-over-day trend chart
  becomes possible. Not resolved yet.
- **73 — Implementation: chart `NarrativeBlock` type.** Recharts integration; the `chart` block
  schema (`kind: 'bar' | 'line' | 'scatter' | 'pie'`, value-ref reference); `verifyAndRepair`-family
  dangling-ref check; wired into both `ArticlePage`'s and the Thread page's Narrative renderer for the
  source-comparison case. Not blocked — uses only existing `NarrativeValueRef` data.
