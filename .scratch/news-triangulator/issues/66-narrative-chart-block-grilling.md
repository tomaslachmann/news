# 66 — Grilling: a chart/data `NarrativeBlock` type

**Type:** grilling

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

*Not yet run.*
