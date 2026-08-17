# 30 — Persist a Call Record for Every LLM Chat-Completion Call

**What to build:** Every chat-completion call in the backend — extraction, synthesis, narrative, story verification, and (per ticket 29) keyword extraction, all routed through `llmClient.ts`'s shared `callJsonModel` — is durably recorded: what was sent (model, system prompt, user content), what came back (raw response content) or the error it threw, and which pass made the call. Recorded in a new Postgres table, browsable via Prisma Studio (this project's existing ad hoc data-inspection tool) instead of grepping ephemeral Docker logs for a bare failure count. This is the core of the spec — after this ticket, a maintainer can already inspect real Extraction/Synthesis/Narrative/verification LLM calls and failures.

**Blocked by:** 29 — Unify Keyword Extraction Onto the Shared LLM Client (needs every chat-completion call routed through one function before instrumenting that one function actually means "every call")

**Status:** ready-for-agent

- [x] A new persisted entity records: which module made the call (a `callSite` label), the model name, the request (system prompt + user content), the response (raw content) or the thrown error, and a timestamp
- [x] A repository function creates one record per call. No relation to `Analysis`/`Coverage`/`Story` — several call sites (e.g. keyword extraction on a brand-new submission) run before those exist yet; deliberately deferred, not an oversight
- [x] `callJsonModel` records both a successful call and a failed one (not only failures), tagged with the `callSite` of whichever module invoked it
- [x] Every existing `callJsonModel` caller (`extractionPass`, `synthesisPass`, `narrativePass`, `storyVerification`, `keywordExtractor`) passes its own `callSite` label through; none of them implement recording themselves — instrumentation lives in `callJsonModel` alone
- [x] A successful call still returns exactly what it returns today; a thrown error still propagates exactly as it does today — recording is a side effect around the existing call, not a replacement for it
- [x] No truncation or size cap on stored request/response payloads — full text is stored
- [x] No pruning or retention logic is implemented. Documented as a deliberate, explicit trade-off in a new ADR (next number), not left as an undocumented gap
- [x] `CONTEXT.md` gains a glossary entry naming and defining this new concept
- [x] `callJsonModel` is unit-tested by mocking the new recording function: a successful call records a success row and still returns its result; a thrown error records a failure row (with the error) and still rethrows; the `callSite` passed by the caller is what actually gets recorded
- [x] The new repository function is integration-tested against a real, ephemeral Postgres instance (testcontainers), following `test/integration/analysis.test.ts`'s existing pattern — create a record, read it back, assert the fields round-trip
- [x] `extractionPass.test.ts`, `synthesisPass.test.ts`, `narrativePass.test.ts`, `storyVerification.test.ts`, and the keyword-extraction tests require no behavioral changes beyond whatever mocking updates `callJsonModel`'s new signature/dependency needs — they already mock `llmClient.js` at the module boundary, so instrumentation added inside it is invisible to them by construction

## Notes

Spec: `docs/spec-llm-call-logging.md`. Second of a three-ticket chain (29 → 30 → 31). Testing approach follows ADR 0007 exactly (mocked-boundary unit tests + a required integration test since this ticket touches Prisma/the database directly) — not a new pattern invented for this ticket.

The whitespace-normalization fix to `quoteVerification.ts` that originally motivated this investigation is explicitly out of scope here — it's deferred until this ticket ships and real failure data is available to confirm or refute the hypothesis, rather than fixing based on a guess.

## Implementation (2026-08-17)

A local code-review's first run hit an API session limit partway through and was retried. The retry surfaced 6 candidates (no correctness bugs); 3 were fixed:
- `callSite` was a bare `string`; replaced with an exported `LlmCallSite` union (the five known callers) so a typo or a future stray value can't silently fragment the table this ticket exists to make queryable.
- `schema.prisma`'s own comment already named ticket 31's differently-shaped embedding calls as a future occupant of this same table, without the schema actually accommodating that shape — `systemPrompt`/`userContent` made nullable now (a one-line change, folded into this ticket's own not-yet-shipped migration rather than stacking a second one) so ticket 31 doesn't need a follow-up migration to loosen columns this ticket just tightened. `callJsonModel`'s own contract is unaffected — it still always provides both.
- The success/failure recording payloads in `callJsonModel` repeated 4 of 6 fields; deduplicated via a shared `logBase` object.

Two more were left as-is, both already explicitly discussed as deliberate trade-offs in ADR 0020's own text rather than oversights: `recordLlmCallSafe`'s `console.error` fallback if the recording write itself fails, and awaiting the record synchronously on the hot path (including inside `storyVerification`'s concurrent batch fan-out) rather than firing-and-forgetting it.

Local dev DB note: applying the migration required baselining 7 pre-existing migrations first (`prisma migrate resolve --applied`) — this dev database's `_prisma_migrations` tracking table was missing/empty despite the actual tables already existing, a pre-existing environment quirk unrelated to this ticket, not something this work caused.
