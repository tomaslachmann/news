# Spec — Tool-Generated Article Headline

**Triage label:** ready-for-agent

## Problem Statement

When News Triangulator finishes an Analysis — whether from a human-submitted Seed Article or an event Ingestion found — the headline shown to readers on the finished Article, and on every row of the public Articles listing, is literally the original title of whichever single source happened to trigger it, copied verbatim. This works against the project's own premise: a tool built to expose how different outlets frame the same event through headline word choice and emphasis shouldn't itself adopt one outlet's framing as the Article's own title. A reader sees one source's editorial choice — what to lead with, what words to use — presented as if it were the Article's own neutral summary, before they've even opened it.

## Solution

Once an Analysis reaches `COMPLETE` (every source extracted, Synthesis has classified every claim into the four Dimensions), the tool generates its own short Czech headline for the Article — grounded only in claims from the **Agreement** dimension, so it can never assert something that was contested or framed differently across sources, the same restraint the Cross-Source Narrative's prose already applies to itself. This generated headline becomes the reader-facing title everywhere a finished Article is shown. It's generated eagerly, as part of the same step that marks an Analysis `COMPLETE` — not lazily on first view like the Narrative prose — so the public listing never shows a stolen headline for something that's actually finished. Before an Analysis is `COMPLETE` (still under review, still a Draft, mid-Synthesis), the original seed article's title continues to serve as a working title exactly as it does today — nothing changes about how earlier pipeline stages look or behave.

## User Stories

1. As a Reader, I want a completed Article's headline to be written by the tool itself rather than copied from one source, so that I'm not shown one outlet's framing as if it were the Article's own neutral title.
2. As a Reader, I want every row in the public Articles listing to show the tool-generated headline for any Article that's actually finished, so that I can judge what's being reported before I even click in.
3. As a Reader, I want the tool-generated headline to only ever state something every/most sources actually agreed on, so that the headline itself can't smuggle in a claim that was disputed or framed differently across outlets.
4. As a Reader, I want the headline for an Article to stay stable once generated (unless the Analysis is genuinely reprocessed), so that a link I saw or shared still points at something with the same title.
5. As a Reader, I want the tool-generated headline to be in Czech, matching every other reader-facing string in the app.
6. As a Reader, I want the public listing to keep showing the working title for any Analysis that isn't `COMPLETE` yet, exactly as today, so that nothing about how in-progress items are displayed changes.
7. As an Admin, I want the Draft review queue, the Review Step, and the initial seed-submission flow to keep showing the original source title exactly as they do today, so that I can still recognize and investigate the specific triggering article during review, before an Article exists yet to have its own headline.
8. As an Admin, I want the "this looks like the same story" dedup-match confirmation screen to show the generated headline when the matched Analysis is already `COMPLETE`, and the working title otherwise, so that title display is consistent with how the rest of the app presents a matched Analysis.
9. As an Admin, I want an Analysis to not be marked `COMPLETE` until a headline has been successfully generated for it, so that no Article is ever published to readers without one.
10. As an Admin, I want a failure to generate a headline to be visible and diagnosable, so that if an Analysis gets stuck unable to complete, I can tell why.
11. As an Admin, I want to see the generated headline for every Analysis that's actually `COMPLETE` without needing to open it first, so that the internal History listing (which shows every status, not just completed ones) reflects a finished Article's real title as soon as it's finished.
12. As a Maintainer, I want the headline-generation LLM call routed through the same shared client every other pass already uses, so that it's automatically covered by the existing durable call-logging instrumentation without any extra wiring.
13. As a Maintainer, I want `Story.anchorHeadline` (the internal same-event matching anchor used by Discovery/Ingestion/dedup matching) left completely untouched by this feature, so that matching quality isn't affected by a change that's only about reader-facing presentation.
14. As a Maintainer, I want the generated headline stored alongside the existing Cross-Source Narrative fields, not as a new top-level concept, so that "how do we present a finished Article" logic stays in one place.
15. As a Maintainer, I want headline generation to be its own small, dedicated pass — not folded into Synthesis's classification work or Narrative's lazy full-prose generation — so that its scope (Agreement-only input, short output, eager timing) stays cleanly separable from both.
16. As a Maintainer, I want the constraint to Agreement-only content enforced structurally (only Agreement items are ever passed as input) as well as by explicit prompt instruction, so that a future refactor accidentally widening the input doesn't silently reintroduce a framing risk with no defense left.
17. As a Maintainer, I want existing tests for the Extraction, Synthesis, and Narrative passes, and for the SSE stream handler that sequences them, to keep passing without meaningful behavior changes beyond whatever the new step requires, so that this feature doesn't destabilize the existing pipeline.
18. As a Maintainer, I want no backfill mechanism built for the Analysis that's already `COMPLETE` from before this feature existed, so that scope stays limited to Analyses completing from now on.
19. As a Maintainer, I want the title-display fallback (generated headline if present, else working title) implemented once and reused everywhere it's needed (Article page, listing, dedup-match screen), rather than three separate implementations of the same rule.

## Implementation Decisions

- **New column**: `SynthesisResult.headline` (nullable `String`) — alongside the existing `dimensions`/`narrative` fields on the same model. Null for any `SynthesisResult` row that predates this feature, or in the case described below where generation is skipped.
- **New pass module** (name TBD at ticket level, e.g. `headlinePass.ts`) exporting a function that takes only the Analysis's Agreement-dimension items and calls the shared `callJsonModel` client. `llmClient.ts`'s `LlmCallSite` union gains a new value for this pass, so it's automatically covered by the existing durable LLM-call logging.
- **Prompt**: produces a single short Czech headline string. Grounded only in Agreement-dimension content, enforced both structurally (no other dimension's items are ever included in the input) and by explicit prompt instruction. No quote-verification step is needed — a headline is an authored short phrase, not a claimed verbatim quote, so the existing `verifyAndRepair`/`isVerbatimQuote` machinery (built specifically to check `czechQuote` fields) doesn't apply here.
- **Insertion point**: the SSE stream handler's Extraction→Synthesis sequence, between the Synthesis pass succeeding and the Analysis being marked `COMPLETE`. Headline generation happens after Synthesis, before completion.
- **Atomicity**: the repository function that currently persists `dimensions` and flips `Analysis.status` to `COMPLETE` in one transaction is widened to also persist the headline in that same transaction. This is what makes "blocks publishing" actually true — there is never a window where an Analysis is `COMPLETE` but has no headline.
- **Failure behavior**: if headline generation fails, the Analysis does not transition to `COMPLETE` — it surfaces as a Synthesis-stage failure the same way any other failure in that sequence already does today, not a new failure mode/status.
- **Display fallback, applied consistently in one place**: the Article page's title, every row of the public listing, and the seed-submission dedup-match confirmation screen all prefer the generated headline when present, falling back to the working title (`Analysis.seedHeadline`) otherwise.
- **Unaffected surfaces**: the Draft review queue, the Review Step, and the initial seed-submission flow continue showing only the working title — no headline can exist yet at those stages, and nothing about their current behavior changes.
- `Story.anchorHeadline` and `Analysis.seedHeadline` receive no new writes and no new reads beyond their current usage — this feature adds a new field and new read sites, it does not touch either existing one.
- No backfill for the one pre-existing `COMPLETE` Analysis — it keeps showing its working title until it's next re-synthesized, if ever.

## Testing Decisions

Tests only external behavior (what a caller/reader observes), not internal implementation details — matching how every existing pass in this pipeline is tested.

- The new pass module is unit-tested by mocking `llmClient.js`'s `callJsonModel`, the exact pattern `extractionPass.test.ts`/`synthesisPass.test.ts`/`narrativePass.test.ts` already use: given a set of Agreement-dimension items, assert the prompt/input sent contains only that content, and that the returned headline is passed through unmodified.
- The widened completion repository function is integration-tested against a real, ephemeral Postgres instance via testcontainers, following `test/integration/analysis.test.ts`'s and the `LlmCallLog` repository's integration test's existing pattern: complete an Analysis with a headline, read it back, assert it round-trips alongside `dimensions` and the `COMPLETE` status change, all within the one transaction.
- The SSE stream handler's existing test coverage for its Extraction→Synthesis sequence is updated to include the new step in the mocked call sequence, without changing what it asserts about Extraction/Synthesis's own success/failure behavior.
- The display-fallback logic (generated headline vs. working title) is plain, deterministic mapping logic — tested at whatever layer this codebase already tests presentational mapping logic (its mapper-layer tests), not duplicated three times across the three surfaces that use it.

## Out of Scope

- Backfilling the one pre-existing `COMPLETE` Analysis.
- Any admin UI to view, edit, or regenerate a headline — it's tool-authored and immutable once generated, same as every other pipeline output.
- Any change to `Story.anchorHeadline`'s role, value, or usage.
- Any change to the Cross-Source Narrative's existing lazy, first-view-triggered generation — this feature adds a new eager step alongside it, it does not change Narrative's own timing.
- Any retry/backoff policy beyond whatever pattern Synthesis's own failure handling already uses today.
- A fully settled answer for an empty Agreement dimension at completion time — see Further Notes.

## Further Notes

Produced via a `/grill-with-docs` session (2026-08-17), triggered by the observation that displaying one source's original headline as an Article's own title works against the project's core premise of exposing framing differences rather than adopting one.

**One edge case surfaced but not fully settled in grilling, flagged for a quick check before implementation**: what happens when the Agreement dimension is empty at the moment Synthesis completes — a real possible outcome (e.g. sources that agree on almost nothing), not just a theoretical one. Since headline generation is now a hard gate blocking `COMPLETE`, an unhandled empty-Agreement case would leave that Analysis permanently stuck. The recommended default, not yet explicitly confirmed: skip generation and leave `headline` null, falling back to the working title via the same display-fallback rule already used pre-completion, rather than blocking completion on a case with no correct headline to generate.

**One inferred consequence, also flagged for a quick sanity check rather than treated as fully settled**: the dedup-match confirmation screen showing the generated headline for an already-`COMPLETE` match follows naturally from the general display-fallback rule, but wasn't independently confirmed in the grilling session the way the Article page and listing were.
