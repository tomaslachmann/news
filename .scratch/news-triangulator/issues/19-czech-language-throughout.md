# 19 — Czech Language Throughout

**What to build:** Switch all LLM-generated analysis prose and every hardcoded UI string from English to Czech — a hard cutover, no i18n layer. See ADR 0016 for the full design rationale.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `extraction.txt`: "All prose you write must be in English" → Czech equivalent; per-category instructions ("concise English summary", etc.) updated to ask for Czech
- [ ] `synthesis.txt`: "All prose must be in English" and every "English summary"/"English explanation" instruction updated to Czech
- [ ] `narrative.txt`: "All prose must be in English" and "English narrative text for this segment" updated to Czech
- [ ] `docs/spec.md` requirement #33 rewritten to specify Czech analysis prose, with the updated rationale (audience is Czech-speaking; mixed-language paraphrase/quote was the actual problem)
- [ ] `czechQuote` field name and the prose/quote schema split are left unchanged — still a distinct field from `prose`/`statement`/etc., per ADR 0016
- [ ] Every hardcoded UI string in `packages/frontend/src` (nav labels, tab names, buttons, empty states, admin pages, error/status messages, page titles) translated to Czech
- [ ] No locale-switching mechanism introduced — Czech is hardcoded, not configurable
- [ ] Existing backend tests asserting English prose in fixtures/expectations updated to Czech
- [ ] Existing frontend tests (if any) asserting English UI copy updated to Czech
- [ ] Spot check: a Framing-dimension example with contrasting word choice (e.g. "demonstranti" vs. "extremisté") still reads as a clear, distinct framing difference once the surrounding prose is also Czech
