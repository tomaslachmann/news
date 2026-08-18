# ADR 0020 — Durable LLM call logging, no pruning for now

## Status
Accepted

## Context
When a pass in the Analysis pipeline (Extraction, Synthesis, Narrative) or another LLM-dependent flow (Discovery/Ingestion's same-event verification, keyword extraction) fails or behaves unexpectedly, there was previously no way to see what actually happened. Quote verification failures were already logged (`quoteVerification.ts`, ADR 0014), but only as a bare failure count via pino — the request actually sent to the model, the response it actually returned, and any thrown error were never captured anywhere durable or queryable. A Docker log line like `"Quote verification still failing after retry; dropping affected items"` gave no way to investigate why, only that it happened.

Two proposals were weighed in a `/grill-with-docs` session (2026-08-17): enriching the existing pino log line with more fields, or persisting call records to a new database table. The pino-only approach was rejected — Docker logs are ephemeral relative to this project's needs, and this project has no log aggregator (no Sentry/Datadog/Loki anywhere in the stack). Postgres is the one piece of durable infrastructure this app already owns and already migrates on every deploy, and this project has repeatedly leaned on Prisma Studio as its ad hoc data-inspection tool — reusing that rather than standing up new observability infrastructure is the pragmatic choice for a project this size.

## Decision
Every LLM chat-completion call made through `llmClient.ts`'s shared `callJsonModel` is recorded to a new `LlmCallLog` table: which module made the call (`callSite`), the model name, the full request (system prompt + user content, uncapped — no truncation), and either the full response content or the error thrown (uncapped). Both successful and failed calls are recorded, not only failures, so a failing call can be compared against a working one from the same call site.

Instrumentation lives in `callJsonModel` alone, not in each individual pass — nearly every LLM-calling module already routed through it (`extractionPass`, `synthesisPass`, `narrativePass`, `storyVerification`); `keywordExtractor.ts`, the one holdout, was unified onto it first (ticket 29) specifically so this instrumentation covers every chat-completion call, not every call except one. Recording a call is a side effect wrapped around the existing call — a successful call still returns exactly what it always returned, and a thrown error (from the API call itself, or from the response failing to parse as valid JSON) still propagates exactly as before. A failure in the recording step itself is caught and logged to `console.error`, never allowed to break the actual LLM call it was trying to record.

`LlmCallLog` rows have no relation to `Analysis`/`Coverage`/`Story`. Several call sites (e.g. keyword extraction on a brand-new seed submission) run before an Analysis exists yet, and threading an optional foreign key through every caller's signature was judged real, separate invasiveness not justified until the unlinked data actually proves insufficient in practice.

**No pruning or retention policy is implemented.** Rows accumulate indefinitely. This is a deliberate, explicit trade-off, not an oversight — recorded here specifically so a future reader who notices the table's unbounded growth finds an intentional decision instead of a gap nobody thought about. Revisit once real growth is observed, not preemptively.

Ticket 31 extends this same table to `generateEmbedding` calls (a structurally different request/response shape — text in, vector out, no system/user prompt split), completing coverage of every LLM-facing call in the backend.

> **Amended by ADR 0023.** The "full response content... uncapped" description above no longer holds for `'embedding'`-callSite rows: since ADR 0023, a successful embedding call logs `{ dimensions }` instead of the vector itself. Every other call site is unaffected, and this ADR's no-pruning stance is untouched.

## Consequences
- A maintainer can now inspect real Extraction/Synthesis/Narrative/story-verification/keyword-extraction LLM calls and failures via Prisma Studio, instead of grepping ephemeral Docker logs for a bare failure count.
- One additional Postgres write per LLM call (success or failure) — negligible next to the LLM call's own latency, and explicitly allowed to fail without affecting the call it's recording.
- The table has no size cap and no pruning; disk usage grows without bound as a known, accepted consequence of this decision, not a defect.
- `LlmCallLog` is not linked to `Analysis`/`Coverage`/`Story` — investigating "what happened for this specific Analysis" currently means matching on approximate timing/content, not a direct join. A future ticket can add the relation if this turns out to matter in practice.
- The whitespace-normalization hypothesis for `quoteVerification.ts`'s frequent failures (unnormalized newlines from Readability's `textContent` causing legitimate quotes to fail a literal substring check) was deliberately not acted on before this ADR — any fix follows from real data this table makes visible, not from an untested guess.
