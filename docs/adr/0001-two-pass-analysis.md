# ADR 0001 — Two-pass LLM analysis (Extraction then Synthesis)

## Status
Accepted

## Context
The Analysis pipeline must produce four dimensions (Agreement, Contradiction, Unique Reporting, Framing) from 5+ Coverages. The obvious alternative is a single LLM call that receives all article texts and returns all four dimensions at once.

## Decision
Use two passes:
1. **Extraction** — one LLM call per Coverage, run in parallel, each producing a structured set of Claims and Framing Signals for that article alone.
2. **Synthesis** — one LLM call that receives all Extraction outputs and produces the four Analysis Dimensions.

## Consequences
The per-Coverage Extraction calls produce structured, comparable objects before any cross-source reasoning begins. This makes the Synthesis prompt far more reliable — it reasons over structured data rather than raw article text — and makes the pipeline auditable: each Extraction result can be shown to the user as it arrives via SSE, so they can see what the model understood from each Coverage before trusting the Synthesis.

The trade-off is two round trips (latency) and more tokens consumed overall. The latency cost is mitigated by running the five Extraction calls in parallel.

A single-call approach would be cheaper and simpler, but cross-source reasoning over raw text is known to produce hallucinated agreements and missed contradictions when the model has to hold all articles in working memory simultaneously.
