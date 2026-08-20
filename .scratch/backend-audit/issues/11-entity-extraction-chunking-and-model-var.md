# 11 — Entity extraction: chunking and its own model env var

Type: grilling
Status: resolved
Blocked by: 04

## Question

Spun out of [Entity model: table vs. JSON](04-entity-model-table-vs-json.md) — **P1-14** and **P1-15** are both real, confirmed while resolving that ticket, but independent of the storage-shape decision itself. Both touch `entityExtractionPass.ts`, which the entity-table migration already rewrites to build `StoryEntity`/`StoryEntityRelation` rows instead of a JSON blob.

**P1-14**: `analysisService.ts:256` → `entityExtractionPass.ts` sends every Coverage's full text as one `JSON.stringify(sourceTexts)` `userContent`, unchunked. Five ~6,000-character articles is ~30,000 characters in a single prompt, with no token counting and no limit. Failure degrades silently — `extractAndPersistStoryEntities` returns `null` and logs a warning, with nothing in `IngestionRunSummary` or any metric surfacing that relation scoring then ran on embedding + time alone.

**P1-15**: `EXTRACTION_MODEL` is shared across five different passes (`extractionPass`, `storyVerification`, `entityExtractionPass`, `storyRelationPass`, `headlinePass`) with genuinely different cost/quality needs — same-event verification is a binary classification of two headlines, a candidate for the cheapest available model, but can't be cheapened today without also cheapening the main claim extraction pass.

Decide:

1. Chunking strategy for P1-14 — per-Coverage extraction calls (N calls instead of 1, but each bounded) vs. a token-budget-aware batching scheme vs. something else. Note this now writes into `StoryEntity`/`StoryEntityRelation` rows per the entity-table migration, not a single JSON blob — does per-Coverage chunking change how `confidence`/dedup-on-conflict across chunks should work when the same entity is mentioned in multiple chunks?
2. Does silent-degradation-to-null get fixed alongside this, or stay as is (audit flags it as a quality gap but it isn't one of P1-14/P1-15's named findings)?
3. `ENTITY_MODEL` — new env var, same pattern as `EXTRACTION_MODEL`/`SYNTHESIS_MODEL`. Does `storyVerification`, `entityExtractionPass`, `storyRelationPass`, and `headlinePass` each get their own var now, or just `entityExtractionPass` (this ticket's actual scope) with the other three left on `EXTRACTION_MODEL` until their own ticket?

## Answer

Resolved via a `/grilling` session (interactive, not self-answered). The ticket's own premises were partly stale by the time this ticket was picked up — written before tickets 13/14 (pg-boss queue, `entity.extract` job) landed — and the fact-finding pass ahead of the interview corrected them before any question was put to the user:

- The real call site is `entityRelationJob.ts`'s `deriveSourceTexts`, not `analysisService.ts:256` (that line is inside `discoverSources` today, unrelated). `confirmCoverages`/`approveDraft` only enqueue the job; extraction runs later, inside it.
- `IngestionRunSummary` structurally can't observe entity-extraction outcome any more — it's built and returned before the (now-queued) `entity.extract` job ever runs. Extending it was never a live option by the time this ticket was actually resolved.
- "Returns `null` and logs a warning" was only ever true for the zero-entities case, and even then no log call actually fired. A genuine failure (LLM error, zod parse, persistence) already throws and is retried via pg-boss's `LLM_JOB_RETRY_POLICY` (ticket 13) — it doesn't degrade silently.
- P1-15's "5 passes share `EXTRACTION_MODEL`" holds for only 4 of the 5 named passes — `headlinePass` was already independent, on `SYNTHESIS_MODEL`.

1. **No chunking.** A defensive total-input-character budget (`MAX_TOTAL_INPUT_CHARS = 200_000`, comfortably inside `gpt-4o`'s context window — the audit's own worked example puts 5 articles at ~30,000 chars, and today's real ceiling is `MAX_COVERAGES_PER_ANALYSIS = 25` articles) is checked in `runEntityExtractionPass` before the LLM call; exceeding it throws (wrapped as `ExternalServiceError` by the existing `runStageOrThrow`, same path every other failure in this pass already takes) rather than silently truncating. This sidesteps P1-14's actual design cost entirely: `replaceStoryEntities` (`repositories/entity.ts`) is a whole-Story-replace-in-one-call function — a second call with only that chunk's entities would delete every `StoryEntity` row from the first chunk not re-mentioned in the second, and unconditionally wipes *all* `StoryEntityRelation` rows regardless of overlap. Real per-Coverage chunking would need either an in-memory accumulate-then-persist-once step or new merge logic in the repository layer, for a risk that's speculative at today's actual volume, not observed. Matches ticket 10's "small scope now, revisit on a real incident" precedent.
2. **Zero-entity extraction now logs.** `extractAndPersistStoryEntities` calls `log?.info({ storyId, sourceTextCount }, 'No entities extracted for this Story')` before returning `null` — `info`, not `warn`, since a thin or off-topic source producing zero entities isn't a failure condition.
3. **New `ENTITY_MODEL` env var, `entityExtractionPass` only** (`process.env.ENTITY_MODEL ?? 'gpt-4o'`, same default-preserving pattern as every other `*_MODEL` var — introducing it changes nothing unless an operator sets it explicitly). `extractionPass`, `storyVerification`, and `storyRelationPass` stay on `EXTRACTION_MODEL` until each gets its own ticket. `headlinePass` was never in scope here — it was already on `SYNTHESIS_MODEL`.

Added to `.env.example` and both `backend`/`worker` blocks in `docker-compose.yml` (the `entity.extract` job runs in `worker`, not `backend`, so it needs the var there too).

A `/code-review` pass caught three real issues, all fixed. The main one: the char-budget throw, as first written, was a plain `Error` inside `runEntityExtractionPass`, unconditionally wrapped as `ExternalServiceError` by `runStageOrThrow` — indistinguishable from a genuinely retryable failure, so `entity.extract`'s `LLM_JOB_RETRY_POLICY` would burn all 3 attempts on a condition guaranteed to fail identically every retry (the same pinned Coverage set produces the same total length every time), exactly the waste `entityRelationJob.ts`'s own existing "Analysis no longer exists" precheck was written to avoid for a different permanent condition. Fixed by exporting `MAX_TOTAL_INPUT_CHARS` from `entityExtractionPass.ts` and adding the same precheck-and-skip (log + return, no throw) in `runEntityRelationJob` before entering the pipeline at all — `runEntityExtractionPass`'s own throw stays as a correctness backstop for any other caller. The other two: CONTEXT.md and README.md's env-var reference table both lacked an `ENTITY_MODEL`/"Entity Model" entry alongside their existing `EXTRACTION_MODEL`/`SYNTHESIS_MODEL` ones (added to both).
