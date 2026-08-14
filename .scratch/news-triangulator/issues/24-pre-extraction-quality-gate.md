# 24 — Pre-Extraction Quality Gate

**What to build:** A bulk LLM verification pass that runs once, at Draft approval (`DRAFT → PENDING`), re-checking every Coverage a Draft has accumulated against its Story's `anchorHeadline` via the existing `verifyCandidatesAgainstAnchor`, excluding anything that fails before Extraction runs. This is the safety net that makes ticket 23's removal of per-attach LLM verification acceptable — see ADR 0018.

**Blocked by:** 23 — Embedding-Based Ingestion Candidate Retrieval (this gate exists specifically to backstop unverified embedding-based attaches; not meaningful without it).

**Status:** done

- [x] `approveDraft` (`ingestionService.ts`) runs the quality gate before flipping status to `PENDING`: fetches all non-excluded Coverage on the Analysis, verifies each against `story.anchorHeadline` via `verifyCandidatesAgainstAnchor`
- [x] Coverage that fails verification is excluded (the existing `excluded` flag), not deleted — consistent with how the Review Step already handles deselection
- [x] If every Coverage on a Draft fails verification, approval still proceeds to `PENDING` as normal — no new failure path is invented. The existing zero-extractable-sources handling in `analysisStream.ts` (already produces a `synthesis-error` event and `FAILED` status) naturally covers this once the stream runs, since excluded Coverage is already filtered out of `findCoveragesForAnalysis`'s default query
- [x] The number of Coverage items excluded by the gate is logged, so a high exclusion rate is visible (mirrors the "high verification-failure rate is logged" pattern from ADR 0014/ticket 17)
- [x] Human-seeded Analyses (never went through `DRAFT`) are unaffected — the gate only runs on the `DRAFT → PENDING` transition
- [x] Tests cover: all Coverage verifies (no exclusions, approval proceeds normally with everything intact); some Coverage fails (excluded, approval proceeds with the remainder); all Coverage fails (approval still proceeds to `PENDING` with zero non-excluded Coverage, no new error thrown at approval time)

## Notes

Code review caught three real bugs before merge, all stemming from the same root cause: this gate makes the DRAFT-approval window meaningfully longer (a Coverage-list-sized LLM fan-out) than it used to be (a single fast DB write), which turns previously-theoretical races into realistically hittable ones:
- **Used `excludeCoverages` (a "keep only these ids" call), not the exclusion-only semantics it needed.** If Coverage was attached by a concurrent Ingestion poll *during* verification, that new row's id wasn't in the verified-keep-list either, so it would have been silently excluded too, despite never being sent to verification at all. Added `excludeCoverageIds` (exclude *exactly* these ids, touch nothing else) instead.
- **`updateAnalysisStatus` unconditionally wrote `PENDING`** — if an Admin rejected the same Draft concurrently while verification was in flight, that `FAILED` write could land first, and this gate's own write would silently overwrite it back to `PENDING`, resurrecting a Draft that had just been explicitly rejected. Added `updateAnalysisStatusIfCurrently(id, 'DRAFT', 'PENDING')`, a conditional update that only succeeds if the row is still `DRAFT`; if not, it logs and leaves the status alone.
- **Unbounded fan-out.** `verifyCandidatesAgainstAnchor`'s own doc comment says an unbounded candidate list "should chunk it before calling this" — this call site didn't, and per ADR 0018 a Draft can legitimately accumulate many Coverage rows across polls before an Admin ever reviews it. Added `verifyCandidatesAgainstAnchorInBatches` to `storyVerification.ts` (batch size 10, mirroring `discovery.ts`'s `MAX_CANDIDATES`) so this — and any future caller — actually satisfies that contract instead of just documenting it.
- Also tightened the exclusion warn log's wording: `verifySameStorySafe` degrades any LLM/infra failure to the same `sameEvent: false` shape as a genuine mismatch, so the aggregate count alone can't distinguish "the gate correctly rejected bad matches" from "the LLM was down and we discarded a good source" — the log now points at the per-candidate `verifySameStory` log entries for that detail instead of implying the count is all genuine rejections.
