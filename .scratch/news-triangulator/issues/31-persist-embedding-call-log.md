# 31 — Persist a Call Record for Every Embedding Call

**What to build:** `embeddingClient.ts`'s `generateEmbedding` — used by Ingestion's per-item matching and human-seeded submission's dedup check (ADR 0018, ADR 0019) — is recorded into the same table ticket 30 introduced, completing "every LLM-facing call is investigable" coverage. Structurally different from a chat completion (text in, vector out — no system/user prompt split, no JSON parsing), so it's instrumented separately even though it shares the same underlying table and repository function.

**Blocked by:** 30 — Persist a Call Record for Every LLM Chat-Completion Call (reuses the table/repository function it introduces)

**Status:** ready-for-agent

- [x] `generateEmbedding` records both a successful call and a failed one using the same repository function ticket 30 introduced, tagged with a `callSite` label identifying its caller
- [x] The request (input text) and the response (the embedding) or the thrown error are recorded in full — no truncation
- [x] A successful call still returns exactly what it returns today; a thrown error still propagates exactly as it does today
- [x] `generateEmbedding` is unit-tested the same way as `callJsonModel` (mocking the recording function): a successful call records a success row and still returns its result; a thrown error records a failure row and still rethrows
- [x] Existing callers of `generateEmbedding` (Ingestion's `runIngestionPass`, human-seeded submission's dedup check in `analysisService.createAnalysis`) require no behavioral changes; their existing tests pass unchanged beyond whatever mocking the new dependency requires

## Notes

Spec: `docs/spec-llm-call-logging.md`. Last of a three-ticket chain (29 → 30 → 31). Small — the project owner noted it could be folded into ticket 30 instead if a third near-trivial ticket isn't worth the overhead; kept separate here since the request/response shape genuinely differs from a chat completion.

## Implementation (2026-08-17)

A local code-review surfaced 3 candidates; 2 were real and fixed:
- `recordLlmCallSafe` (the try/catch wrapper ensuring a logging failure can't break the LLM call it's recording) was copy-pasted verbatim into `embeddingClient.ts`, duplicating ticket 30's copy in `llmClient.ts`. Moved to `repositories/llmCallLog.ts` (co-located with `recordLlmCall`, which it wraps) and exported for both `llmClient.ts` and `embeddingClient.ts` to share. This also meant relocating the "does a logging failure actually get swallowed" test: it now lives directly against `recordLlmCallSafe` in a new `llmCallLog.test.ts` (mocking `db.js`'s Prisma client, not `recordLlmCall` itself), since `llmClient.test.ts`/`embeddingClient.test.ts` now mock the already-safe wrapper wholesale and can no longer exercise its internal try/catch.
- A doc comment on `NewLlmCallLog.systemPrompt` cited "ADR 0019/ticket 31" for the nullable-columns rationale; ADR 0019 is unrelated (same-event classification, not this table's schema) — corrected to cite ADR 0020 only.

The third finding was real but not mine to fix: the review flagged an uncommitted `adminer` service added to `docker-compose.yml` (unauthenticated, port 8080, unrelated to this ticket) sitting in the working tree. Left out of this commit entirely and flagged to the project owner separately, rather than silently sweeping an unrelated, security-relevant infra change into this ticket's commit.
