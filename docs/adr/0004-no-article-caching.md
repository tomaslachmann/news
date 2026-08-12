# ADR 0004 — No article content caching

## Status
Accepted

## Context
Fetching and parsing five articles per Analysis takes network time. Caching article text keyed by URL would avoid re-fetching the same article across multiple Analyses.

## Decision
Do not cache article content. Always re-fetch the article URL at Analysis time.

## Consequences
Czech news outlets silently correct articles after publication — updated numbers, corrected names, removed paragraphs. Caching would cause the tool to analyse stale content without any indication that the article has changed, which directly undermines the tool's core goal of accuracy about what was actually reported.

The latency cost of re-fetching is acceptable given that the five fetches run in parallel and the LLM calls dominate the total Analysis time.
