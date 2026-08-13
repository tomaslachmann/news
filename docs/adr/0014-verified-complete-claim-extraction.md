# ADR 0014 — Programmatic quote verification, not a second LLM provider

## Status
Accepted

## Context
Every pass in the Analysis pipeline — Extraction (per-Coverage claims), Synthesis (the four Analysis Dimensions), and the Cross-Source Narrative — asks the model to attach a verbatim Czech quote to each claim it produces, and each prompt already *states* that the quote must be a real substring of the source text. Nothing has ever checked that. The model can drift into paraphrase presented as quotation, or — worst case — invent a plausible-sounding quote outright, and the pipeline has no way to notice. The risk is highest in Synthesis: it never receives the raw source text, only Extraction's already-summarized claims, so any quote it originates cannot be grounded even in principle by the model re-reading the article.

We considered outsourcing this guarantee to Anthropic's Claude API, whose Citations feature structurally grounds cited text against documents it was given — a real, API-enforced guarantee, not just a better-worded prompt. It was rejected: the guarantee we actually need (a quote genuinely appears in the source article) is fully achievable deterministically, because every Coverage's full extracted text is already sitting in Postgres by the time any of these three passes runs. A plain substring check gives the same hard guarantee without a second LLM provider, a second API key, a second billing/error-handling model to maintain, and without the added constraint that Citations cannot be combined with schema-constrained JSON output (which all three passes rely on).

Separately, and interacting with this: none of the three prompts currently push for *completeness*. `extraction.txt` and `synthesis.txt` ask the model to identify claims but never to be exhaustive, and models left unconstrained tend to converge on a handful of salient items. Because the Cross-Source Narrative is architecturally capped by what Synthesis captured (ADR 0012 — "the Dimensions are the ceiling of what the Narrative pass is allowed to assert"), a sparse Synthesis output guarantees a sparse reader-facing Article no matter how good the Narrative prompt is. This matters directly to the verification design below: if a failed quote is simply dropped, verification would compound the existing thinness problem instead of just fixing correctness.

## Decision
`extraction.txt` and `synthesis.txt` gain explicit exhaustiveness instructions — identify every claim/attribution that meets the stated criteria, not just the most notable few. (`narrative.txt` is left alone; its job stays "narrate only what Synthesis already classified," per ADR 0012.)

All three passes' output is validated after the LLM call: every `czechQuote` must be a verbatim substring of the relevant Coverage's `extractedText` (the single article, for Extraction; the specific cited source, for Synthesis and Narrative, since both operate over multiple Coverages at once). One shared verification function is used by all three call sites rather than three separate implementations.

On a failed quote, the pass is retried once with the specific failure fed back to the model, asking it to correct that quote. If it still fails, the *entire claim/dimension-item/segment it belongs to* is dropped — not just the offending attribution — since a Contradiction requires exactly two attributions and an Agreement requires at least one; discarding only the bad attribution can leave a claim that no longer satisfies its own schema. A retry-then-drop-whole-item strategy was chosen over drop-immediately specifically because of the completeness concern above: losing content silently is the failure mode we're trying to avoid, so the pipeline gets one real chance to fix a bad quote before anything is discarded.

## Consequences
- One bounded extra LLM call per pass, only in the (expected to be rare) case a quote fails verification — not a per-claim cost.
- A high verification-failure rate is logged, so a prompt or model regression shows up as a visible signal rather than a silently shrinking Article.
- The three passes now share a small verification utility that all future claim-producing passes should also use.
