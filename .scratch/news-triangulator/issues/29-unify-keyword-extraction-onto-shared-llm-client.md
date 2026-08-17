# 29 — Unify Keyword Extraction Onto the Shared LLM Client

**What to build:** `keywordExtractor.ts` currently maintains its own `OpenAI` client instance and its own inline `chat.completions.create` call, instead of using `llmClient.ts`'s shared `callJsonModel` the way every other LLM-calling module (`extractionPass`, `synthesisPass`, `narrativePass`, `storyVerification`) already does. This is a pure prefactor, with no behavior change: it exists so that when call logging is instrumented once at `callJsonModel` (ticket 30), it actually covers every LLM call in the backend, not every LLM call except keyword extraction.

**Blocked by:** None — can start immediately

**Status:** done

- [x] `callJsonModel` (`llmClient.ts`) accepts a `temperature` parameter instead of a hardcoded `0`, defaulting to `0` so every existing caller's behavior is unchanged unless it explicitly passes a different value
- [x] `keywordExtractor.ts`'s `extractKeywords` calls `callJsonModel` (passing `temperature: 0.2`, its existing value) instead of constructing its own `OpenAI` client and calling `chat.completions.create` directly
- [x] `keywordExtractor.ts` no longer imports or constructs its own `OpenAI` client instance
- [x] `extractKeywords`'s observable behavior is unchanged: same system prompt, same output shape/parsing/validation (still throws on a non-array `keywords` field, still trims and slices to 5 keywords)
- [x] Existing tests for `extractKeywords` and every other `callJsonModel` caller pass, updated only for the new `temperature` parameter where their mocks need it — no assertions about actual behavior change

## Notes

Spec: `docs/spec-llm-call-logging.md`. First of a three-ticket chain (29 → 30 → 31) from a `/grill-with-docs` session (2026-08-17) investigating a Docker log message with no way to see what actually failed.
