# ADR 0023 — Exclude the raw embedding vector from `LlmCallLog.responseContent`

## Status
Accepted

## Context
ADR 0020 recorded that every LLM-facing call — chat-completion or embedding — logs its full, uncapped response content to `LlmCallLog`, and that "ticket 31 extends this same table to `generateEmbedding` calls... completing coverage of every LLM-facing call in the backend." Since ticket 31, `embeddingClient.ts` has stored `JSON.stringify(embedding)` — the full 1536-float vector — as `responseContent` on every successful embedding call.

`docs/audit.md` (P0-4, folded into the wayfinder map's [Quick fixes: no-brainers regardless of scale](../../.scratch/backend-audit/issues/01-quick-fixes-no-brainers.md)) flagged this specifically, not ADR 0020's general "uncapped" policy: a chat-completion's text response is something a maintainer can actually read to debug a failure — a malformed JSON payload, a hallucinated field, an off-topic answer. A 1536-float array offers effectively none of that per byte; nobody debugs a broken embedding call by eyeballing its vector. The value ADR 0020 built this table for — inspecting a call via Prisma Studio to understand why a pass failed or behaved unexpectedly — doesn't transfer to this one call shape, while the storage cost (thousands of floats serialized as text, once per Ingestion poll item and per human-seeded submission) does.

This is narrower than reopening ADR 0020's "no pruning, not preemptively" stance (still in force, untouched by this decision) — it's about what one call type's success case logs, not about deleting or capping anything that's already accumulated.

## Decision
An `'embedding'`-callSite `LlmCallLog` row logs `{ dimensions: number }` as `responseContent` on success, instead of the vector itself. The request side (`userContent`, the input text) is untouched — still logged in full, since that's exactly the kind of content that is useful to compare against a failing call. Failure logging is also untouched: `error` still captures the thrown message on any failure, same as every other call site.

`dimensions` is kept, not `responseContent: null`, because it's still a real (if narrow) debugging signal: a dimension count inconsistent with the configured `EMBEDDING_MODEL` would indicate a genuine problem, and its absence would look identical to a call that never returned any content — a distinction worth keeping.

## Consequences
- ADR 0020's description of embedding-call logging ("completing coverage of every LLM-facing call") is no longer fully accurate for the response side — a reader relying on that ADR alone should be pointed here; ADR 0020 has been amended with a pointer to this ADR.
- A maintainer investigating a specific embedding call can confirm it ran, what text it embedded, whether it succeeded, and (on success) how many dimensions it returned — but not reconstruct or compare the actual vector from the log. If that ever turns out to matter (e.g. debugging a bad-similarity-score investigation that needs the historical vector itself), it's a new, explicit decision to revisit this one, not something to quietly restore.
- Every embedding call logged before this change still has its full vector in `responseContent` — this decision only changes what new rows store, and does not touch or prune existing data (ADR 0020's no-pruning stance is unaffected).
