# 35 — Story Relation Candidate Generation, Confirmation & Persistence

**What to build:** For every newly-visible Story, cheaply shortlist a handful of plausibly-related recent Stories (embedding similarity + entity overlap + entity-relation overlap + time proximity — no LLM call yet), then confirm only that shortlist with a single LLM call each, persisting a typed, directional `StoryRelation` (`RELATED` or `FOLLOW_UP`) with a plain-language reason and a `HIGH`/`LOW` confidence tier. `HIGH` publishes immediately; `LOW` is held for Admin review (built in ticket 37). This ticket makes relations exist and be verifiable via DB inspection; nothing user-facing consumes them yet (tickets 36/37).

**Blocked by:** 34 — Entity & Entity-Relation Extraction (candidate scoring needs `Story.entities`/`entityRelations` to compute overlap)

**Status:** ready-for-agent

- [x] A new `StoryRelation` Prisma model: `id`, `fromStoryId`/`toStoryId` (FKs to `Story`), `type` (enum: `RELATED` | `FOLLOW_UP`), `confidenceTier` (enum: `HIGH` | `LOW`), `reasoning` (String), `status` (enum: `PUBLISHED` | `PENDING_REVIEW` | `REJECTED`), `createdAt`, with `@@unique([fromStoryId, toStoryId])`
- [x] A new deterministic scoring function ranks a widened pool of recent Stories (own time window, distinct from `DEDUP_WINDOW_HOURS`; own threshold, distinct from `MATCH_THRESHOLD` — both implementation-time tunable constants) by a combination of embedding similarity, entity-key overlap, entity-relation overlap, and time proximity, returning the top ~20. The candidate pool includes Stories of any `Analysis` status — cheap to compute regardless of whether a candidate is finished yet
- [x] Only the top handful (e.g. 3–5) of that ranked shortlist gets an actual LLM confirmation call — no LLM call against the full candidate pool
- [x] A new pass module exports a function that, given a Story and one candidate Story, calls `callJsonModel` and returns either `{ related: false }` or `{ related: true, type, confidenceTier, reasoning }` — `type` one of `RELATED`/`FOLLOW_UP` (never `CAUSES` or any causal/interpretive type — out of scope per ADR 0012, see ticket Notes), `confidenceTier` one of `HIGH`/`LOW` (never a raw numeric score)
- [x] `llmClient.ts`'s `LlmCallSite` union gains a new value for this pass, automatically covered by existing durable LLM-call logging (ADR 0020)
- [x] A confirmed `HIGH`-confidence relation is persisted with `status: PUBLISHED` immediately; a confirmed `LOW`-confidence relation is persisted with `status: PENDING_REVIEW`
- [x] Relation-candidate generation runs once, when a Story becomes visible, searching backward against already-visible recent Stories only — existing Stories are never retroactively re-scanned when a newer Story appears; they simply accumulate incoming edges over time
- [x] Same two trigger points as ticket 34 (`approveDraft` for Ingestion-originated, `confirmCoverages` for human-seeded), running immediately after that ticket's entity extraction completes for the same Story
- [x] Idempotent: if this step ever re-runs for the same Story (e.g. a retried request), it does not create a duplicate `StoryRelation` row for a pair already covered (either direction) — checked before insert, backed by the `@@unique` constraint
- [x] A failure anywhere in this pass (scoring, LLM confirmation) degrades gracefully — logged, no `StoryRelation` created for the affected candidate — and never blocks `approveDraft` or `confirmCoverages`
- [x] The deterministic scoring function is unit-tested directly (no mocking), mirroring `storyMatching.test.ts`'s direct testing of `findBestMatch`
- [x] The confirmation pass module is unit-tested by mocking `callJsonModel`, mirroring `headlinePass.test.ts`/`storyVerification.ts`'s pattern — asserting the enum constraints are enforced by the zod schema (an out-of-enum `type` or `confidenceTier` is rejected)
- [x] `StoryRelation` creation (correct `status` per confidence tier, the unique constraint) is integration-tested against a real, ephemeral Postgres instance via testcontainers, mirroring `test/integration/analysis.test.ts`'s pattern
- [x] A new ADR documents: why entities/entityRelations are Story-scoped JSON rather than a global `Entity` table (ticket 34), why `StoryRelation` types are limited to `RELATED`/`FOLLOW_UP` rather than the originally-proposed `CAUSES`/`REACTION`/`DEVELOPMENT` (asserting causation is closer to the interpretive claims ADR 0012 already keeps this tool from making), and why relation confidence is categorical (`HIGH`/`LOW`) rather than a raw score

## Notes

Spec: `docs/spec-event-graph.md`. Second of a four-ticket chain (34 → 35 → {36, 37}). Tickets 36 and 37 both depend only on this one and can proceed in parallel/either order.
