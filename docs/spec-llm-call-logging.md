# Spec — Durable LLM Call Logging

**Triage label:** ready-for-agent

## Problem Statement

When a pass in the Analysis pipeline (Extraction, Synthesis, Narrative) or another LLM-dependent flow (Discovery/Ingestion's same-event verification, keyword extraction) fails or behaves unexpectedly, there is currently no way to see what actually happened. Quote verification failures are already logged (`quoteVerification.ts`, ADR 0014), but only as a bare failure count via pino — the request actually sent to the model, the response it actually returned, and any thrown error are never captured anywhere durable or queryable. When a maintainer sees a Docker log line like `"Quote verification still failing after retry; dropping affected items"`, there is no way to investigate what was asked, what the model said, or why it disagreed with the source text — only that it happened, and how many times.

## Solution

Every LLM-facing call in the backend records what it sent and what it got back (or the error it hit) to a new, durable, queryable table — inspectable via Prisma Studio, the tool this project already uses for ad hoc data investigation, instead of grepping ephemeral container logs for a bare count. Because nearly every pass already calls through one shared client function, instrumentation happens once at that boundary rather than being scattered across each individual pass or prompt, and covers every current and future caller automatically. The one caller that bypasses the shared client today is unified onto it first, so "every LLM call" is actually true rather than true-with-an-asterisk.

## User Stories

1. As a maintainer, I want every LLM call's request and response persisted, so that I can see exactly what was asked and what came back when something goes wrong.
2. As a maintainer, I want a failed LLM call's thrown error captured alongside the request that caused it, so that I can tell a malformed-response failure apart from a network/API failure.
3. As a maintainer, I want every recorded call labeled with which part of the pipeline made it (extraction, synthesis, narrative, story verification, keyword extraction, embeddings), so that I can filter down to the pass I'm actually investigating.
4. As a maintainer, I want successful calls recorded too, not just failures, so that I can compare a failing call against a working one from the same pass.
5. As a maintainer, I want this data to survive container restarts and redeploys, so that a problem I noticed yesterday is still investigable today.
6. As a maintainer, I want to query this data without standing up new infrastructure, so that I can start investigating immediately with tools this project already has (Prisma Studio).
7. As a maintainer, I want records kept indefinitely for now, so that I don't lose the early data this feature exists to collect before I've even seen a meaningful sample of it.
8. As a maintainer, I want this table's no-pruning decision written down somewhere, so that "unbounded growth" is a known, intentional trade-off rather than something a future reader has to rediscover by noticing the table is huge.
9. As a maintainer, I want `keywordExtractor.ts`'s separate, duplicated OpenAI client call unified onto the shared client, so that it's covered by the same instrumentation as every other pass instead of needing its own special case.
10. As a maintainer, I want `generateEmbedding`'s calls recorded too, even though its request/response shape differs from a chat completion, so that embedding failures (e.g. Ingestion's or human-seeded submission's dedup matching) are just as investigable as chat-completion failures.
11. As a maintainer, I want instrumentation to be invisible to every existing caller, so that no pass's actual extraction/synthesis/narrative/verification behavior changes as a side effect of adding logging.
12. As a maintainer, I want a thrown error to still propagate to the caller exactly as it does today, so that existing error-handling (retries, `ExternalServiceError` mapping, etc.) in every calling service keeps working unmodified.
13. As a maintainer, I want this table to not require every caller to know its own `analysisId`/`coverageId` up front, so that call sites that run before an Analysis exists yet (e.g. keyword extraction on a brand-new seed submission) aren't forced to invent one.
14. As a maintainer, I want request/response payloads stored in full rather than truncated, so that I'm not missing exactly the part of a long article or prompt that turns out to matter.
15. As a maintainer, I want this to use the OpenAI client this project already has, so that no second LLM provider, API key, or billing relationship is introduced just to log the first one.
16. As a future maintainer reading `CONTEXT.md`, I want this new concept named and defined in the domain glossary, so that "LLM call log" (or whatever it ends up called) is precise, agreed vocabulary rather than an implementation detail nobody wrote down.
17. As a maintainer, I want the decision to defer `analysisId`/`coverageId` linkage recorded as a deliberate trade-off, so that a future reader understands it was a scope choice, not an oversight.
18. As a maintainer investigating why quote verification "often fails," I want this data available *before* any fix to `quoteVerification.ts` ships, so that the fix (if any) is based on what actually happened in production, not a guess.

## Implementation Decisions

- `keywordExtractor.ts` is unified onto `llmClient.ts`'s `callJsonModel` instead of maintaining its own `OpenAI` client instance and inline `chat.completions.create` call. `callJsonModel` gains a `temperature` parameter (currently hardcoded to `0`) so `keywordExtractor`'s existing `0.2` temperature is preserved, not silently changed.
- `callJsonModel` is instrumented to record every call it makes: the model name, the system prompt, the user content, and either the raw response content or the thrown error — plus a `callSite` label identifying which module invoked it (extraction, synthesis, narrative, story verification, keyword extraction). Every existing caller (`extractionPass`, `synthesisPass`, `narrativePass`, `storyVerification`, and now `keywordExtractor`) is covered automatically by this one change; none of them are modified to add logging themselves, only to pass their `callSite` label through.
- `embeddingClient.ts`'s `generateEmbedding` is instrumented the same way, separately, since its request/response shape differs from a chat completion (text in, vector out — no system/user prompt split, no JSON parsing).
- A new persisted entity records each call: which module made it (`callSite`), the model name, the request payload, the response payload or error, and when it happened. No relation to `Analysis`/`Coverage`/`Story` — several call sites (keyword extraction on a brand-new submission, the pre-dedup embedding check) run before those exist yet, and threading an optional identifier through every caller's signature is a real, separate invasiveness this spec explicitly defers (see Out of Scope).
- Both success and failure are recorded — not only failures — so a failing call can be compared against a working one from the same call site.
- Instrumentation must not change any existing caller's observable behavior: a successful call still returns exactly what it always returned; a thrown error still propagates exactly as it does today. Recording is a side effect around the existing call, not a replacement for it.
- No payload truncation or size cap — requests/responses are stored in full.
- No pruning or retention policy is implemented. This is recorded as a deliberate, explicit trade-off in a new ADR (this repository's threshold for an ADR — hard to reverse, surprising without context, a real trade-off — is met by "a new table with no growth bound"), not left as an undocumented gap.
- `CONTEXT.md` gains a glossary entry for the new concept this table represents, since it is new domain vocabulary, not merely an implementation detail.
- This spec does not itself decide the table's name or exact column list — that is an implementation-tickets-level decision, not a product/architecture decision.

## Testing Decisions

Two seams, matching this project's existing two-layer testing pattern (ADR 0007: unit tests at mocked external-service boundaries; integration tests for anything touching Prisma/the database directly) — not a new pattern invented for this feature:

- **`callJsonModel` and `generateEmbedding`** (and, incidentally, the now-unified `keywordExtractor`) are unit-tested by mocking the new recording function, the same "mock the repo, test the caller" convention already used throughout this codebase (`analysisService.test.ts`, `ingestionService.test.ts`). Assertions: a successful call still returns its existing result *and* triggers a success record; a thrown error still propagates *and* triggers a failure record with the error captured; the `callSite` label passed through is what actually gets recorded.
- **The new repository function itself** is a thin Prisma wrapper and gets an integration test against a real ephemeral Postgres instance via testcontainers, following `test/integration/analysis.test.ts`'s existing pattern exactly (create a record, read it back, assert the fields round-trip). This is required, not optional, per ADR 0007's existing rule that any ticket touching Prisma directly needs integration coverage — this ticket adds a new table, so it qualifies.
- No test changes are needed in `extractionPass.test.ts`, `synthesisPass.test.ts`, `narrativePass.test.ts`, or `storyVerification.test.ts` — they already mock `llmClient.js`/`embeddingClient.js` at the module boundary, so instrumentation added inside those modules is invisible to them by construction.

## Out of Scope

- The whitespace-normalization fix to `quoteVerification.ts`'s `isVerbatimQuote` (the hypothesis that unnormalized newlines/whitespace cause spurious verification failures). Deliberately deferred: this logging ships first, real failure data is reviewed, and any fix follows from what that data actually shows — not from an untested guess.
- Linking recorded calls to `analysisId`/`coverageId`/`storyId`. Revisit only if the unlinked data turns out to be insufficient in practice.
- Any retention/pruning policy or implementation. Documented as a known, accepted gap (see Implementation Decisions), not solved here.
- Any admin-facing UI to browse this data. Prisma Studio is the intended access method for now.
- Payload truncation, sampling, or size limits.
- Any LLM provider other than the OpenAI client this project already uses.
- Broadening instrumentation to non-LLM external calls (GDELT, RSS, article scraping) — out of scope; this spec is about LLM/embedding calls specifically.

## Further Notes

Produced via a `/grill-with-docs` session (2026-08-17) that began as an investigation into a Docker log line (`"Quote verification still failing after retry; dropping affected items"`) reported as failing often, with no way to investigate why. The session's first proposal (enrich the existing pino log line, plus ship a whitespace-normalization fix based on a code-inspection hypothesis) was explicitly rejected in favor of durable, queryable storage and deferring any fix until real data is available — see User Story 18 and the Out of Scope whitespace item. The session also surfaced, independently of the original question, that `keywordExtractor.ts` duplicates `llmClient.ts`'s OpenAI client rather than reusing it — folded into this spec's scope since it's required for "every LLM call" to be literally true, not a separate concern.
