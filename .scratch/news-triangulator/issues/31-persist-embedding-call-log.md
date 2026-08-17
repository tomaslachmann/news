# 31 — Persist a Call Record for Every Embedding Call

**What to build:** `embeddingClient.ts`'s `generateEmbedding` — used by Ingestion's per-item matching and human-seeded submission's dedup check (ADR 0018, ADR 0019) — is recorded into the same table ticket 30 introduced, completing "every LLM-facing call is investigable" coverage. Structurally different from a chat completion (text in, vector out — no system/user prompt split, no JSON parsing), so it's instrumented separately even though it shares the same underlying table and repository function.

**Blocked by:** 30 — Persist a Call Record for Every LLM Chat-Completion Call (reuses the table/repository function it introduces)

**Status:** ready-for-agent

- [ ] `generateEmbedding` records both a successful call and a failed one using the same repository function ticket 30 introduced, tagged with a `callSite` label identifying its caller
- [ ] The request (input text) and the response (the embedding) or the thrown error are recorded in full — no truncation
- [ ] A successful call still returns exactly what it returns today; a thrown error still propagates exactly as it does today
- [ ] `generateEmbedding` is unit-tested the same way as `callJsonModel` (mocking the recording function): a successful call records a success row and still returns its result; a thrown error records a failure row and still rethrows
- [ ] Existing callers of `generateEmbedding` (Ingestion's `runIngestionPass`, human-seeded submission's dedup check in `analysisService.createAnalysis`) require no behavioral changes; their existing tests pass unchanged beyond whatever mocking the new dependency requires

## Notes

Spec: `docs/spec-llm-call-logging.md`. Last of a three-ticket chain (29 → 30 → 31). Small — the project owner noted it could be folded into ticket 30 instead if a third near-trivial ticket isn't worth the overhead; kept separate here since the request/response shape genuinely differs from a chat completion.
