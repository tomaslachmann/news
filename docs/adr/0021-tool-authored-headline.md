# ADR 0021 — Tool-authored headline, generated eagerly from Agreement only

## Status
Accepted

## Context
Before this change, a completed Analysis had no headline of its own — the Article's displayed title was `Analysis.seedHeadline`, always one Source's original wording, carried over unchanged from whichever article seeded the Analysis. A `/grill-with-docs` session (2026-08-17) raised this as a problem in its own right: presenting one outlet's headline as the title of a multi-source triangulation implicitly endorses that outlet's framing, which is exactly the single-source bias this tool exists to move past (see the project's problem statement in `CLAUDE.md` and ADR 0012's rule against the Cross-Source Narrative ever adjudicating a disputed fact).

Two questions had to be settled: what the headline is allowed to draw on, and when it gets generated.

**What it draws on.** A headline generated from all four Synthesis Dimensions risks stating a Contradiction as settled fact, alluding to a Framing difference as if it were neutral, or leading with a Unique Reporting claim only one Source made. Constraining it to Agreement — the one Dimension that is, by definition, what the Sources don't dispute — is the only way to guarantee the headline never adjudicates anything Synthesis itself is explicitly built not to adjudicate (ADR 0012's "never a winner-declarer" principle, applied to a five-word title instead of a paragraph).

**When it's generated.** The Cross-Source Narrative is generated lazily — on first view, then cached — because it's expensive prose nobody may ever read if the Analysis isn't opened. A headline is different: every Article listing row, nav entry, and page title needs one the moment an Analysis is COMPLETE, not on first click-through. Generating it lazily would mean either falling back to `seedHeadline` until the first view (reintroducing the single-source problem this ADR exists to fix, indefinitely for any Analysis nobody opens) or blocking the first viewer's page load on a synchronous LLM call. Neither is acceptable, so headline generation is eager: it runs as its own pass, after Synthesis and before the Analysis is allowed to transition to COMPLETE.

## Decision
A new `SynthesisResult.headline` field is populated by a dedicated pass (`headlinePass.ts`), run after `runSynthesisPass` and before `completeAnalysisWithSynthesis`, inside `analysisStream.ts`'s existing Synthesis try/catch — a thrown error from the headline pass fails the Analysis exactly the way a Synthesis failure already does (`FAILED` status, `synthesis-error` event), rather than being treated as a softer, separately-recoverable failure. This guarantees there is never a window where an Analysis is COMPLETE without a headline already generated: `completeAnalysisWithSynthesis` writes `dimensions` and `headline` together with the `COMPLETE` status flip, all in one Prisma transaction.

The pass receives only the Agreement dimension's prose (not its attributions, not any other Dimension) as model input — see Headline in `CONTEXT.md` for the three now-distinct headline-shaped fields this introduces (`Story.anchorHeadline`, `Analysis.seedHeadline`, `SynthesisResult.headline`) and why none of the first two are touched by this feature.

If Agreement is empty at completion time, the pass returns `null` without calling the model rather than forcing a headline out of Contradiction/Unique Reporting/Framing content it isn't allowed to draw on. `headline` is nullable in the schema for exactly this case, and for every Analysis completed before this field existed. Ticket 33 (unimplemented as of this ADR) covers what a reader sees in that null case — this ADR only covers generation and storage, not display fallback.

The pass is instrumented through the same `callJsonModel` choke point as every other LLM-calling pass, tagged with a new `'headline'` `LlmCallSite` (see ADR 0020) — no separate observability path was introduced for it.

## Consequences
- An Analysis's displayed title, once COMPLETE, no longer implicitly endorses any one Source's framing — it's now text the tool generated from what the Sources agree on.
- Completing an Analysis costs one additional LLM call beyond Extraction and Synthesis. Small relative to Synthesis's own cost, but not free — a Draft with heavy Coverage still pays it once per completion, not per view (unlike the Narrative).
- A headline-pass failure now fails the whole Analysis, same as a Synthesis failure. This is deliberate: a COMPLETE Analysis with no headline was judged worse than a FAILED Analysis a reader can retry, given how central the headline is to how the Article is found and displayed.
- `headline` can legitimately be `null` on a COMPLETE Analysis (empty Agreement, or pre-feature backfill gap — no backfill was run per the original grilling decision). Every place that reads it must handle that case; ticket 33 defines the fallback.
- Three fields now carry "headline" in their name across three different entities (`Story.anchorHeadline`, `Analysis.seedHeadline`, `SynthesisResult.headline`), each with a distinct purpose and lifecycle. Future readers should consult the Headline glossary entry in `CONTEXT.md` rather than assume any two of them are interchangeable.
