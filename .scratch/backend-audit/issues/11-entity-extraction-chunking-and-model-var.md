# 11 — Entity extraction: chunking and its own model env var

Type: grilling
Status: open
Blocked by: 04

## Question

Spun out of [Entity model: table vs. JSON](04-entity-model-table-vs-json.md) — **P1-14** and **P1-15** are both real, confirmed while resolving that ticket, but independent of the storage-shape decision itself. Both touch `entityExtractionPass.ts`, which the entity-table migration already rewrites to build `StoryEntity`/`StoryEntityRelation` rows instead of a JSON blob.

**P1-14**: `analysisService.ts:256` → `entityExtractionPass.ts` sends every Coverage's full text as one `JSON.stringify(sourceTexts)` `userContent`, unchunked. Five ~6,000-character articles is ~30,000 characters in a single prompt, with no token counting and no limit. Failure degrades silently — `extractAndPersistStoryEntities` returns `null` and logs a warning, with nothing in `IngestionRunSummary` or any metric surfacing that relation scoring then ran on embedding + time alone.

**P1-15**: `EXTRACTION_MODEL` is shared across five different passes (`extractionPass`, `storyVerification`, `entityExtractionPass`, `storyRelationPass`, `headlinePass`) with genuinely different cost/quality needs — same-event verification is a binary classification of two headlines, a candidate for the cheapest available model, but can't be cheapened today without also cheapening the main claim extraction pass.

Decide:

1. Chunking strategy for P1-14 — per-Coverage extraction calls (N calls instead of 1, but each bounded) vs. a token-budget-aware batching scheme vs. something else. Note this now writes into `StoryEntity`/`StoryEntityRelation` rows per the entity-table migration, not a single JSON blob — does per-Coverage chunking change how `confidence`/dedup-on-conflict across chunks should work when the same entity is mentioned in multiple chunks?
2. Does silent-degradation-to-null get fixed alongside this, or stay as is (audit flags it as a quality gap but it isn't one of P1-14/P1-15's named findings)?
3. `ENTITY_MODEL` — new env var, same pattern as `EXTRACTION_MODEL`/`SYNTHESIS_MODEL`. Does `storyVerification`, `entityExtractionPass`, `storyRelationPass`, and `headlinePass` each get their own var now, or just `entityExtractionPass` (this ticket's actual scope) with the other three left on `EXTRACTION_MODEL` until their own ticket?
