# 32 — Generate and Store a Tool-Authored Headline Before an Analysis Completes

**What to build:** Once Synthesis succeeds for an Analysis, the tool generates its own short Czech headline — grounded only in claims from the Agreement dimension, so it can never assert something contested or framed differently across sources — and persists it in the same transaction that marks the Analysis `COMPLETE`. No Analysis can become `COMPLETE` without a headline. This ticket makes the headline exist and be verifiable via API/DB; it does not yet make it visible to a reader (see ticket 33).

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [x] A new pass module exports a function that takes an Analysis's Agreement-dimension items and calls the shared `callJsonModel` LLM client, returning a short Czech headline string
- [x] `llmClient.ts`'s `LlmCallSite` union gains a new value for this pass, so its calls are automatically covered by the existing durable LLM-call logging (ADR 0020) — no separate wiring
- [x] Headline-generation input is structurally restricted to Agreement-dimension items only — no Contradiction/Unique Reporting/Framing content is ever included in what's sent to the model — and the prompt explicitly instructs the same constraint as a second layer of defense
- [x] No quote-verification step is applied to the generated headline — it's an authored short phrase, not a claimed verbatim quote, so the existing `verifyAndRepair`/`isVerbatimQuote` machinery (built for `czechQuote` fields) does not apply here
- [x] `SynthesisResult` gains a nullable `headline` column (schema + migration), alongside the existing `dimensions`/`narrative` fields
- [x] Headline generation runs in the SSE stream handler's Extraction→Synthesis sequence, after Synthesis succeeds and before the Analysis is marked `COMPLETE`
- [x] The repository function that persists `dimensions` and flips `Analysis.status` to `COMPLETE` is widened to also persist the headline in that same transaction — there is never a window where an Analysis is `COMPLETE` without a headline
- [x] If headline generation fails, the Analysis does not transition to `COMPLETE` — it surfaces as a Synthesis-stage failure the same way any other failure in that sequence already does today, not a new failure mode
- [x] If the Agreement dimension is empty at completion time, headline generation is skipped and `headline` stays null, rather than blocking completion indefinitely (the spec's recommended default for this edge case)
- [x] `Story.anchorHeadline` and `Analysis.seedHeadline` receive no new writes and no new reads — completely untouched by this ticket
- [x] No backfill for the one pre-existing `COMPLETE` Analysis
- [x] The new pass is unit-tested by mocking `llmClient.js`'s `callJsonModel`, matching `extractionPass.test.ts`/`synthesisPass.test.ts`/`narrativePass.test.ts`'s existing pattern: given a set of Agreement-dimension items, assert the input sent contains only that content, and the returned headline is passed through unmodified
- [x] The widened completion repository function is integration-tested against a real, ephemeral Postgres instance (testcontainers), following `test/integration/analysis.test.ts`'s pattern — complete an Analysis with a headline, read it back, confirm it round-trips alongside `dimensions` and the `COMPLETE` status change within the one transaction
- [x] The SSE stream handler's existing test coverage for its Extraction→Synthesis sequence is updated to include the new step in the mocked call sequence, without changing its existing assertions about Extraction/Synthesis's own success/failure behavior

## Notes

Spec: `docs/spec-article-headline-generation.md`. First of a two-ticket chain (32 → 33), split at "the tool produces the headline" vs. "readers see it" — matches how the earlier LLM-call-logging chain (29→30→31) split backend infrastructure from its consumers.

The empty-Agreement-dimension behavior above is the spec's stated recommended default, not independently re-confirmed in the grilling session that produced the spec — implement as specified; flag during review if it turns out wrong in practice.
