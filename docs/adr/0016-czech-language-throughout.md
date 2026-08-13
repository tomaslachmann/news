# ADR 0016 — Analysis prose and UI in Czech, not English

## Status
Accepted

## Context
`docs/spec.md` requirement #33 originally specified English analysis prose: "I want all analysis prose to be in English, so that I can understand the analysis without reading Czech." Every prompt (`extraction.txt`, `synthesis.txt`, `narrative.txt`) enforces this today, and the frontend's UI chrome — nav labels, buttons, tab names, admin pages, empty states — is entirely English as well. In practice the tool's actual audience reads Czech; forcing English paraphrase around Czech verbatim quotes (`czechQuote`) creates a jarring mixed-language reading experience rather than the accessibility benefit the original requirement assumed.

## Decision
All LLM-generated prose — Extraction's claim summaries, Synthesis's four Dimension descriptions, and the Cross-Source Narrative Article — switches from English to Czech. Every hardcoded UI string across the frontend switches to Czech too, as a hard cutover: no locale switcher, no i18n abstraction layer. The tool is Czech-only end to end, matching its actual single-audience use, not a product that needs to support multiple languages.

The prose/quote distinction survives the language switch unchanged. `czechQuote` stays a field distinct from `prose` even though both are now Czech, because the reason it exists was never really about translation — it distinguishes the tool's own synthesized description of a claim from the source's exact original wording, which still matters for the "hover to verify against the original" UX (spec.md requirements #20/25/28) and for Framing specifically, where word choice itself is the signal ("demonstranti" vs. "extremisté" is a real framing difference whether or not the surrounding sentence is also in Czech).

`docs/spec.md` requirement #33 is rewritten to reflect this — Czech prose, because the audience is Czech-speaking and language-switching between paraphrase and quote was the actual problem, not the reverse. Requirement #34 (verbatim Czech quotes) and the "load-bearing" prose/quote distinction stay as written.

## Consequences
- Three prompt files and every user-facing string in `packages/frontend/src` change — a large, mechanical, low-architectural-risk migration.
- No abstraction is introduced for re-adding English later; doing so would mean redoing this work, not flipping a config flag. Accepted because there is no product requirement for a second language today.
- Existing tests asserting English prose/UI copy need updating to Czech expectations.
