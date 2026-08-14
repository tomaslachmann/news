# 24 — Pre-Extraction Quality Gate

**What to build:** A bulk LLM verification pass that runs once, at Draft approval (`DRAFT → PENDING`), re-checking every Coverage a Draft has accumulated against its Story's `anchorHeadline` via the existing `verifyCandidatesAgainstAnchor`, excluding anything that fails before Extraction runs. This is the safety net that makes ticket 23's removal of per-attach LLM verification acceptable — see ADR 0018.

**Blocked by:** 23 — Embedding-Based Ingestion Candidate Retrieval (this gate exists specifically to backstop unverified embedding-based attaches; not meaningful without it).

**Status:** ready-for-agent

- [ ] `approveDraft` (`ingestionService.ts`) runs the quality gate before flipping status to `PENDING`: fetches all non-excluded Coverage on the Analysis, verifies each against `story.anchorHeadline` via `verifyCandidatesAgainstAnchor`
- [ ] Coverage that fails verification is excluded (the existing `excluded` flag / `excludeCoverages`), not deleted — consistent with how the Review Step already handles deselection
- [ ] If every Coverage on a Draft fails verification, approval still proceeds to `PENDING` as normal — no new failure path is invented. The existing zero-extractable-sources handling in `analysisStream.ts` (already produces a `synthesis-error` event and `FAILED` status) naturally covers this once the stream runs, since excluded Coverage is already filtered out of `findCoveragesForAnalysis`'s default query
- [ ] The number of Coverage items excluded by the gate is logged, so a high exclusion rate is visible (mirrors the "high verification-failure rate is logged" pattern from ADR 0014/ticket 17)
- [ ] Human-seeded Analyses (never went through `DRAFT`) are unaffected — the gate only runs on the `DRAFT → PENDING` transition
- [ ] Tests cover: all Coverage verifies (no exclusions, approval proceeds normally with everything intact); some Coverage fails (excluded, approval proceeds with the remainder); all Coverage fails (approval still proceeds to `PENDING` with zero non-excluded Coverage, no new error thrown at approval time)
