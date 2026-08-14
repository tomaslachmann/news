# 23 — Embedding-Based Ingestion Candidate Retrieval

**What to build:** Replace Ingestion's GDELT-keyword-search retrieval (via `discoverCoverage`/`extractKeywords`) with a cheap embedding-similarity comparison against recently-open Stories, deciding attach-to-existing-Story vs. create-new-Draft without any LLM call on the hot path. See ADR 0018.

**Blocked by:** None. `Story` and `verifyCandidatesAgainstAnchor` already exist, from the earlier same-event-matching work.

**Status:** done

- [x] `CandidateArticle`/RSS item parsing gains an excerpt field (from `rss-parser`'s `contentSnippet` or equivalent) where the feed provides one
- [x] `Story` schema gains an embedding column (`float[]`/JSON — not pgvector, per ADR 0018) computed from `anchorHeadline` + excerpt at creation
- [x] A shared embedding-generation function wraps OpenAI's embeddings API, mirroring `llmClient.ts`'s existing pattern for the chat completions client
- [x] A cosine-similarity utility scores a candidate embedding against a Story's embedding
- [x] A time-decay factor is combined with the similarity score so recent Stories are weighted higher than stale ones with a superficially similar headline — exact curve is a tunable constant (mirrors `GDELT_MIN_THRESHOLD`/`DEDUP_WINDOW_HOURS`), not fixed by this ticket
- [x] Ingestion's per-item flow queries Stories within the existing dedup window, scores the new item against each, and attaches to the highest-scoring match above a confidence threshold — or creates a new Draft + Story if nothing clears the threshold (queries *every* Analysis status in the window, not just DRAFT/PENDING — see Notes)
- [x] `extractKeywords` and `discoverCoverage` are removed from `runIngestionPass` entirely — no LLM call, no GDELT/RSS search, anywhere in the Ingestion path
- [x] A new Draft/Story created because nothing matched is seeded with only the triggering item's own Coverage — no eager search for other outlets at creation time; other outlets' coverage is picked up organically on later polls
- [x] Human-seeded Discovery (`discoverCoverage`, `extractKeywords`, the Review Step's `verifyCandidatesAgainstAnchor` call) is completely untouched — this ticket only changes the Ingestion path
- [x] Tests cover: a new item matching an existing open Story's embedding above threshold attaches as Coverage; a new item below threshold for every open Story creates a new Draft + Story; the time-decay factor lowers an otherwise-similar old Story's score enough to prefer creating a new Draft over a stale match

## Notes

- The candidate query (`findRecentStoriesForMatching`) deliberately includes *every* Analysis status within the window, not just DRAFT/PENDING as the checklist above literally says — matching the old GDELT-based flow's behavior: a match against a COMPLETE Analysis still needs to surface as a possible addition, and a match against FAILED must still be recognized as already-seen so it isn't recreated every poll. Restricting to DRAFT/PENDING would have silently dropped both of those cases.
- Code review caught and fixed three real bugs before merge: (1) the original time-decay curve (flat exponential, no grace period) made even a perfect-similarity match fail after ~10 hours, well inside the 48h dedup window — fixed with a 24h full-strength grace period before decay starts, so same-day coverage from a different outlet reliably still matches; (2) `generateEmbedding` silently returned `[]` instead of throwing when the API returned no data, which would have bypassed Ingestion's skip-and-retry path and created a permanently unmatchable orphaned Story; (3) candidates were being re-queried from Postgres once per RSS item instead of once per poll — fixed to fetch once and append newly-created Drafts in-memory, preserving same-poll visibility (a Story created earlier in a poll must still be matchable by a later item in that same poll) without the redundant round-trips.
- `CONTEXT.md`'s `Draft Analysis` entry was also corrected (code review) — it still claimed a Draft's Coverage set "has already been found via Discovery," which this ticket makes false.
- Known, intentional gap: human-seeded Stories (`analysisRepo.createAnalysis`) do not get an embedding computed, so Ingestion's matching pool can't recognize "a new RSS item is about the same event a human already started manually" — only Ingestion-created Stories participate in cheap matching for now. Left out of scope per the ticket's explicit "human-seeded Discovery is completely untouched," but worth a follow-up ticket if duplicate Stories from this gap turn out to matter in practice.
