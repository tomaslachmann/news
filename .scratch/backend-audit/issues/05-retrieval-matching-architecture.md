# 05 — Retrieval/matching architecture: pgvector + unified scorer, now or trigger-deferred?

Type: grilling
Status: open
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
