# ADR 0012 — Cross-Source Narrative: generated from Dimensions, not from raw text alone

## Status
Accepted

## Context
The tool's stated non-goal is not declaring a winner or replacing the reader's judgement (see `CLAUDE.md`). But reading four separate dimension tabs is a worse reading experience than a single article, and readers legitimately want prose combining what every source reported, not four disconnected lists. The risk: an LLM pass that reads raw source texts directly and writes a merged article is, in effect, adjudicating every disagreement itself — exactly what the tool exists to avoid.

## Decision
The Cross-Source Narrative pass receives both the full raw text of every Coverage (for detail, quotes, completeness) and the already-computed four Analysis Dimensions, as a binding classification it must respect: Agreement is stated plainly with every confirming Source cited, Contradiction is presented as unresolved disagreement, Unique Reporting is attributed to its one Source, Framing differences are described rather than smoothed over. The Dimensions act as a guardrail the raw text alone couldn't provide — the model can write richly, but can't quietly resolve a disputed fact, because the Dimension classification already fixed what's agreed and what isn't before this pass ever runs.

Generated lazily, on first view of an Analysis, and cached — not eagerly for every Analysis, since automated Ingestion (ADR 0013) can create many Analyses nobody ever opens.

Reader-facing (no login) product surface presents this as reading an "Article" — the underlying domain entity stays `Analysis`; "Article" is a presentation label, not a new entity, and doesn't collide with `Coverage` (already means a single-source article in the glossary).

## Consequences
This is a second LLM pass per Analysis, beyond Extraction and Synthesis, adding real cost and latency — mitigated by lazy generation. `CLAUDE.md`'s "not meant to declare a winner" language needed a one-paragraph addendum clarifying that a generated narrative is in scope as long as it never adjudicates a Contradiction itself; a future reader encountering an LLM-authored "article" without that context would reasonably assume the tool had abandoned its founding principle.
