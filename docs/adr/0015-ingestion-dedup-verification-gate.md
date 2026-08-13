# ADR 0015 — Same-event verification gate on Ingestion's dedup match

## Status
Superseded by ADR 0017. A production example showed the same risk this ADR addressed also exists before an Analysis is ever created, and in the human-seeded flow this ADR never covered — ADR 0017 generalizes the mechanism designed here into a `Story` entity applied at all three attach points, not just Ingestion's dedup match.

## Context
ADR 0013 already tightened Ingestion's dedup match once: it only trusts a candidate URL that GDELT itself confirmed, not the unfiltered RSS-fallback layer, after live testing showed the RSS-only signal produced false-positive matches. But the match itself (`findRecentAnalysisMatchingUrls`) is still URL-equality, not a comparison between the new article and the Analysis it's about to be matched against: it only checks whether Discovery, run on the new article's keywords, happened to resurface a URL that already exists as a Coverage somewhere. Two independent keyword extractions coincidentally converging on the same URL is a weaker signal than actually asking "are these the same real-world event?"

The consequence differs by what the match is against. A match against a `COMPLETE` Analysis already gets a human check — it becomes a pending-addition, reviewed before anything about the completed Analysis changes. A match against `DRAFT` or `PENDING` does not: the new article is silently attached as another Coverage, and for `PENDING` that Analysis may already be past its one Review Step and mid-Extraction/Synthesis. A false-positive join there mixes an unrelated article into a Story's Synthesis with nobody ever asked to confirm it.

## Decision
Before Ingestion acts on any match `findRecentAnalysisMatchingUrls` returns, an explicit LLM call judges whether the new article and the existing Analysis are genuinely about the same real-world event — given the new article's scraped title/excerpt and the existing Analysis's `seedHeadline`, no additional scraping required — and returns a structured yes/no plus its reasoning. This applies uniformly to all outcomes of a match (auto-attach to `DRAFT`/`PENDING`, flag as a pending-addition against `COMPLETE`), not just the unreviewed auto-attach path: the call is cheap (it only fires when the existing URL heuristic already found a candidate, not once per RSS item scanned), and it also keeps the Admin's pending-addition review queue from filling with garbage the URL heuristic got wrong. On "no," the item falls through exactly the no-match path already exists — it becomes its own new Draft.

This stays on the same OpenAI model already used for keyword extraction and the rest of the classify/connect pipeline. It's a same/different-event judgment call, not a task that benefits from Claude's document-grounding capabilities — those solve quote attribution (ADR 0014), not event comparison.

## Consequences
- Ingestion's dedup match becomes two-stage: the existing cheap URL-heuristic candidate lookup, unchanged, followed by a semantic confirmation gate before anything is trusted.
- One extra LLM call, but only when a URL-based candidate is already found — preserves ADR 0013's "no LLM cost until Draft approval" invariant for the common no-match case.
- A rejected match is indistinguishable downstream from "no match was ever found" — it does not need its own status or review-queue entry.
