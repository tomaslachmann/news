# 19 — Czech Language Throughout

**What to build:** Switch all LLM-generated analysis prose and every hardcoded UI string from English to Czech — a hard cutover, no i18n layer. See ADR 0016 for the full design rationale.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] `extraction.txt`: "All prose you write must be in English" → Czech equivalent; per-category instructions ("concise English summary", etc.) updated to ask for Czech
- [x] `synthesis.txt`: "All prose must be in English" and every "English summary"/"English explanation" instruction updated to Czech
- [x] `narrative.txt`: "All prose must be in English" and "English narrative text for this segment" updated to Czech
- [x] `docs/spec.md` requirement #33 rewritten to specify Czech analysis prose, with the updated rationale (audience is Czech-speaking; mixed-language paraphrase/quote was the actual problem)
- [x] `czechQuote` field name and the prose/quote schema split are left unchanged — still a distinct field from `prose`/`statement`/etc., per ADR 0016
- [x] Every hardcoded UI string in `packages/frontend/src` (nav labels, tab names, buttons, empty states, admin pages, error/status messages, page titles) translated to Czech
- [x] No locale-switching mechanism introduced — Czech is hardcoded, not configurable
- [x] Existing backend tests asserting English prose in fixtures/expectations updated to Czech
- [x] Existing frontend tests (if any) asserting English UI copy updated to Czech
- [x] Spot check: a Framing-dimension example with contrasting word choice (e.g. "demonstranti" vs. "extremisté") still reads as a clear, distinct framing difference once the surrounding prose is also Czech

## Notes

- Beyond the ticket's literal `packages/frontend/src` scope: also translated backend application-authored error strings (`NotFoundError`/`ValidationError`/`ConflictError`/`ExternalServiceError` messages in `userService.ts`, `analysisStream.ts`, `ingestionService.ts`, `analysisService.ts`, `articleScraper.ts`, and route-level zod-fallback strings) after discovering that `throwApiError` on the frontend reads `body.error` (the backend's `err.message`) before falling back to its own Czech string — so the English backend messages were actually winning over the translations already made in the frontend service layer.
- Zod's own default validation messages (e.g. invalid-URL, string-too-short) are left as-is — localizing those would mean localizing the whole `@news-triangulator/shared` schema layer, a separate and much larger effort than this ticket's scope. Only the one custom `.refine()` message (`PatchAdminUserBodySchema`) was translated, since it's app-authored text, not a zod default.
- Underlying exception `.message` strings from third-party libraries (network errors, OpenAI SDK errors, etc.) that flow through generic `catch` blocks are not translated — only the app's own fallback/default strings are. This mirrors the judgment call already made in the frontend service layer for `narrativePass`/`analysisStream` error fallbacks.
- "Framing" (UI tab label) and "Admin" (role badge) intentionally kept as established Czech loanwords, not translated.
- `Failed to fetch /api/me` in `services/auth/index.ts` intentionally left in English — an internal diagnostic string referencing a literal API path, never rendered to a user.
