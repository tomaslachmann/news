# 05 — Prompt Engineering: Extraction & Synthesis Prompts

**What to build:** Two LLM prompt definitions — one for the Extraction pass, one for the Synthesis pass — with precise JSON output schemas and tested against real article content. These prompts are the core of the tool's analytical quality. They must be written, iterated on with real Czech articles, and validated before the Extraction Pass (ticket 06) and Synthesis Pass (ticket 07) are built on top of them. The output schemas are also the source of truth for the types in `packages/shared`.

**Blocked by:** 01 — Project Scaffold. (Can be worked in parallel with 02–04.)

**Status:** ready-for-agent

- [ ] **Extraction prompt** is written and stored as a standalone, readable prompt file (not buried in business logic). It instructs the model to extract from a single article:
  - Factual claims: verifiable assertions about who, what, when, where (each as a discrete item with original Czech quote)
  - Attributed claims: statements of the form "X said Y" (each with speaker, statement, and original Czech quote)
  - Interpretive statements: opinions or conclusions presented as fact (each with original Czech quote)
  - Framing signals: observable editorial choices — headline word choice, which facts are emphasised, emotional register, expert sources quoted (each as a discrete item with original Czech quote)
- [ ] **Extraction output schema** is a strict JSON schema (or Zod schema) validated at runtime; the model is called with structured output / response format enforced
- [ ] **Synthesis prompt** is written and stored as a standalone prompt file. It receives all Extraction results for a Story and produces four Analysis Dimensions:
  - Agreement: claims confirmed by all or most Sources (with per-outlet attribution and Czech quote)
  - Contradiction: pairs of Claims from different Sources that are logically incompatible — different numbers, actors, or sequences for the same event (with both sides attributed and quoted)
  - Unique Reporting: Claims made by exactly one Source that others omit (attributed and quoted)
  - Framing: the same facts packaged with different Framing Signals across Sources (contrasting examples attributed and quoted)
- [ ] The Synthesis prompt explicitly encodes the Contradiction/Framing boundary: Contradiction = logically incompatible facts (cannot both be true); Framing = same facts, different presentation (both can be true simultaneously)
- [ ] **Synthesis output schema** is a strict JSON schema (or Zod schema) validated at runtime
- [ ] Both schemas are the source of truth for the corresponding types in `packages/shared` — the shared types are updated to match exactly
- [ ] Both prompts are tested with at least two real Czech news articles covering the same story: the output is inspected manually and the schema validation passes
- [ ] All analysis prose in the output is in English; Czech quotes are preserved verbatim in the `czechQuote` fields
- [ ] The Synthesis prompt instructs the model that every item in every dimension must carry at minimum: English prose summary, outlet name, original Czech quote, and article URL
