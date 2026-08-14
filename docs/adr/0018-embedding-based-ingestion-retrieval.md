# ADR 0018 — Embedding-based candidate retrieval for automated Ingestion, LLM verification deferred to a pre-Extraction quality gate

## Status
Accepted

## Context
ADR 0013 built automated Ingestion on top of Discovery's existing GDELT+RSS keyword search: every new RSS item gets an LLM keyword-extraction call, then a GDELT/RSS search for other coverage of the same event. ADR 0017 then made `verifySameStory` (via `verifyCandidatesAgainstAnchor`) the universal per-attachment verification gate, closing a confirmed production bug where an unverified heuristic match let unrelated articles become Coverage. Together, this means every single incoming RSS item during a poll costs at least one LLM call (keyword extraction), plus a GDELT search, plus another LLM call for anything the search finds — regardless of whether that item ends up mattering. Most incoming articles are either genuinely novel (no existing coverage yet to match against) or already known; only a minority actually cluster with something else. At the scale automated Ingestion is meant to run at (many outlets, frequent polling), putting an LLM call on the hot path for every item doesn't scale down gracefully.

A cheaper first pass can absorb almost all of this: comparing a new item's embedding (computed from its title + excerpt, not the full article) against currently-open Stories' embeddings, weighted by recency, can decide attach-vs-new-Draft without any LLM call in the common case.

This intentionally removes the LLM verification from the attach decision itself — a real, deliberate exception to ADR 0017's "every attachment is individually LLM-verified" rule. To avoid reopening the exact risk ADR 0017 exists to close — an unverified match reaching Extraction/Synthesis unnoticed, since the Admin review queue shows only a headline and a Coverage count, never the matched articles themselves — a verification checkpoint is preserved, just relocated: immediately before Extraction begins (at Draft approval), every Coverage a Draft has accumulated is bulk-verified via the existing `verifyCandidatesAgainstAnchor`, and anything that fails is excluded from the Analysis rather than failing the whole approval.

This changes the automated Ingestion path only. Human-seeded Discovery (a single, manually-triggered GDELT+RSS search followed by per-candidate verification before the Review Step) keeps its current LLM-per-candidate behavior — the cost profile that makes per-item LLM calls unattractive at Ingestion's polling scale doesn't apply to one manually-triggered analysis.

pgvector was considered for storing/comparing embeddings and rejected. The comparison set at any moment is small and bounded — Stories with an open Draft/PENDING Analysis within roughly the existing 48-hour dedup window, tens of rows, not millions — where an exact, in-application brute-force cosine similarity scan is simpler and sufficient. Adding pgvector would mean a non-default Postgres image (this repo's `docker-compose.yml` runs plain `postgres:16-alpine`, which doesn't ship the extension) and would hit Prisma's lack of a native vector column type, forcing raw-SQL/TypedSQL workarounds on every migration that touches it — real infrastructure cost for a dataset size where it buys nothing. Revisit only if the comparison set's size changes materially.

OpenAI's embeddings API was chosen over a dedicated embeddings vendor, for the same reason ADR 0014 rejected a second LLM provider for quote verification: no new billing relationship, credentials, or error-handling model to maintain.

Foreign (non-Czech) sources, and using them as a corroboration/verification layer in the Analysis output, came up during this design discussion but are explicitly out of scope here — tracked as separate future work, motivated less by corroboration alone and more by a broader future goal of better source acquisition (custom per-story fetches, agent-driven discovery).

## Decision
1. RSS items carry enough content to embed cheaply: title + description/excerpt (not full article text). `CandidateArticle`/RSS parsing gains an excerpt field where the feed provides one.
2. `Story` gains a persisted embedding, computed from its `anchorHeadline` (+ excerpt where available) at creation — an in-application `float[]` column, not a pgvector type.
3. Ingestion's per-item flow changes:
   - Compute the new item's embedding.
   - Score it against every open Story's embedding (cosine similarity, in application code) within the existing dedup window, combined with a time-decay factor — no LLM call.
   - Above a confidence threshold: attach as Coverage to the matched Story's Analysis, respecting the existing DRAFT/PENDING/COMPLETE branching from ADR 0013/0017.
   - Below threshold: create a new Draft + Story, seeded with just this one item. No eager GDELT/keyword search for other outlets at creation time — other outlets' coverage of the same event is picked up organically as their own RSS items arrive on later Ingestion polls and embedding-match against this Story.
   - `extractKeywords` and `discoverCoverage` (GDELT+RSS keyword search) are no longer called anywhere in the Ingestion path.
4. A quality gate runs once, at Draft approval (`DRAFT → PENDING`, before Extraction starts): every Coverage already accumulated on that Analysis is verified against the Story's `anchorHeadline` via the existing `verifyCandidatesAgainstAnchor`. Anything that fails is excluded from the Analysis (the same `excluded` mechanism the Review Step already uses), not just flagged — the whole approval doesn't fail because of one bad source.
5. Human-seeded Discovery (`discoverCoverage`, GDELT+RSS, `verifyCandidatesAgainstAnchor` before the Review Step) is unchanged.
6. Drafts below a minimum accumulated-source count stay hidden from the Ingestion review queue (a visibility filter only) — they keep accumulating Coverage in the background across polls until they cross it, at which point they surface for Admin review exactly as today. Admin approval remains the actual publish gate; nothing auto-approves.

## Consequences
- Ingestion no longer spends an LLM call on every incoming RSS item — only Drafts that actually reach Admin approval ever trigger one (the quality gate), a significant cost reduction at polling scale.
- A new Draft for a genuinely novel event starts single-source; multi-source corroboration accumulates over subsequent polls rather than being eagerly searched for at creation. Slower time-to-multi-source in exchange for removing a GDELT search and a keyword-extraction LLM call from the hot path of every incoming item.
- The attach decision is no longer individually LLM-verified — trust shifts to the embedding+time-decay scoring formula being good enough in the common case, backstopped by the pre-Extraction quality gate catching anything that slipped through before it ever reaches a reader. This is a deliberate, scoped exception to ADR 0017: the guarantee ADR 0017 actually cares about (nothing unverified reaches Extraction/Synthesis) is preserved, just checked in bulk at a later point instead of individually at attach time.
- Entity-overlap scoring and the exact similarity/time-decay weighting formula are left as tunable implementation detail (mirroring existing constants like `GDELT_MIN_THRESHOLD`, `DEDUP_WINDOW_HOURS`) rather than fixed here — expect real-world tuning once live data is observed.
- No pgvector, no new Postgres extension or base image change; embeddings are compared in application code over a bounded recent-Stories query.
- Foreign sources, and their use as a corroboration layer, remain explicitly out of scope — a separate future ticket.
- `CONTEXT.md`'s `Ingestion` entry needs correcting: it currently states Ingestion "us[es] Discovery internally as its own dedup check," which becomes false — Ingestion's retrieval mechanism is now embedding-based, independent of Discovery. `Story`'s entry gains a mention of its embedding.
