# 05 — Retrieval/matching architecture: pgvector + unified scorer, now or trigger-deferred?

Type: grilling
Status: resolved
Blocked by: none — can start immediately (not blocked by 04, though its outcome would inform the entity-containment feature's exact shape)

## Question

The audit bundles several related findings under "one retrieval, one scoring" (§7.5, §9.3–§9.4):

- **P0-3** — embeddings stored as `DOUBLE PRECISION[]` with cosine similarity computed in Node over the full candidate pool, instead of pgvector doing it in-database with an ANN index.
- **P1-7** — the effective dedup/candidate window is actually ~26–34h, not the declared 48h, because time is used as a multiplier on the score rather than a hard filter.
- **P1-8** — asymmetric embedding inputs between the ingestion and human-seeded paths, no model-version tracking on stored vectors.
- **P1-9** — entity overlap uses plain Jaccard, wrong for asymmetric entity-set sizes (ties to ticket 04).

Audit's proposed fix is a single scorer (§9.3, `MatchFeatures`/`decide()`) with three calibrated bands (auto-attach ≥0.85, LLM-adjudicate 0.55–0.85, new-story <0.55), a `MatchDecision` log table for calibrating thresholds with real data instead of guessing, and pgvector/HNSW replacing the in-Node pool scan.

This is the clearest case of "legitimate scale work, not needed at today's volume" in the whole audit — decide:

1. What's the actual trigger condition for building this? Candidates: candidate-pool size per match (today's `RELATION_CANDIDATE_POOL_SIZE = 20` from `storyRelationScoring.ts`), total Story count, or match-step latency crossing some threshold. Pick a number, not a vibe — this is what makes the deferral checkable instead of "we'll know it when we feel it."
2. Independent of the full pgvector migration: is the **`MatchDecision` log table** worth building now anyway? The audit argues it's cheap, additive, and is the *only* way to ever calibrate the existing thresholds with data instead of comments admitting they're "a starting point, not a tuned result" — this could be a small accepted-now ticket even if the rest defers.
3. Is P1-7 (window is 26-34h not 48h) a bug worth a small fix now regardless of the bigger migration, since it's a one-line filter-vs-multiplier change?
4. Does deferring this block or complicate ticket 04's outcome (entity containment scoring) or ticket 07 (`Thread`)?

## Answer

**Deferred**: the full pgvector/HNSW + unified `MatchFeatures`/`decide()` scorer (§7.5/§9.3/§9.4). Trigger to revisit: the candidate-pool size a single match call actually scores exceeds 200 — both existing windows (48h story-match, 14-day relation-match) are rolling, throughput-bound rather than tied to total historical `Story` count, so "total Story count" would be an imprecise trigger here; pool size is what actually drives the in-Node scan cost this migration would fix, and it's checkable by logging pool length at each call site, no new instrumentation needed. Doesn't block ticket 04 (already shipped, no pgvector dependency) or ticket 07 (`Thread`'s entity-queryability need is satisfied by ticket 04's tables, independent of this ticket).

**Accepted now, independent of the deferred migration:**

- **`MatchDecision`** — logs same-event matching only (`findBestMatch`, called from both `ingestionService.ts` and `analysisService.ts`), one row per call: the threshold-stage score/verdict always, plus a nullable LLM verdict + `decidedBy` populated when the human-seeded path's `verifySameStoryLogged` confirmation actually runs. Deliberately *not* logging `StoryRelation` candidate scoring — a structurally different decision (links two already-distinct Stories, different feature set and cost profile) whose calibration would only be muddied by sharing one table/threshold-sweep with same-event matching. No FK to `Story`/`Analysis` (same reasoning as `LlmCallLog`, ADR 0020) — purely observational, inspected via Prisma Studio.
- **P1-7** — fixed by removing the multiplicative time-decay from `findBestMatch`'s score entirely; the score is now plain `cosineSimilarity`, plus an explicit hard exclusion for any candidate older than `DEDUP_WINDOW_HOURS` (previously enforced only by the caller's SQL query, now also enforced inside `findBestMatch` itself, since without decay's incidental effect nothing else would reject a stale candidate handed to it directly). This was **not** a redundant filter-alongside-unchanged-decay change as first framed mid-session — decay was the actual mechanism silently shrinking the declared 48h window to ~26-34h, so it had to go, not just get a belt-and-suspenders cutoff next to it.
- **P1-8** — fixed via [ADR 0025](../../../docs/adr/0025-canonical-embedding-input-and-cache.md): one canonical, normalized/boilerplate-stripped/length-capped input construction in `buildEmbeddingInput`, used by both call sites (already true structurally, the fix is inside the function); `Story.embeddingModel`/`embeddingInputHash` added for audit.
- **`EmbeddingCache`** — also via ADR 0025: real idempotence, not just an audit field. A content-addressed `(model, inputHash) → vector` cache checked inside `generateEmbedding` itself, transparent to callers. A cache hit skips both the API call and the `LlmCallLog` write.

Not built: `llm_call_id` linkage from `MatchDecision`/`EmbeddingCache` back to the specific `LlmCallLog` row — nothing in scope needs that traceability.

Implemented on `ticket/audit-05-retrieval-matching-architecture`.
