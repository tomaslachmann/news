# 23 — Embedding-Based Ingestion Candidate Retrieval

**What to build:** Replace Ingestion's GDELT-keyword-search retrieval (via `discoverCoverage`/`extractKeywords`) with a cheap embedding-similarity comparison against recently-open Stories, deciding attach-to-existing-Story vs. create-new-Draft without any LLM call on the hot path. See ADR 0018.

**Blocked by:** None. `Story` and `verifyCandidatesAgainstAnchor` already exist, from the earlier same-event-matching work.

**Status:** ready-for-agent

- [ ] `CandidateArticle`/RSS item parsing gains an excerpt field (from `rss-parser`'s `contentSnippet` or equivalent) where the feed provides one
- [ ] `Story` schema gains an embedding column (`float[]`/JSON — not pgvector, per ADR 0018) computed from `anchorHeadline` + excerpt at creation
- [ ] A shared embedding-generation function wraps OpenAI's embeddings API, mirroring `llmClient.ts`'s existing pattern for the chat completions client
- [ ] A cosine-similarity utility scores a candidate embedding against a Story's embedding
- [ ] A time-decay factor is combined with the similarity score so recent Stories are weighted higher than stale ones with a superficially similar headline — exact curve is a tunable constant (mirrors `GDELT_MIN_THRESHOLD`/`DEDUP_WINDOW_HOURS`), not fixed by this ticket
- [ ] Ingestion's per-item flow queries Stories with an open Draft/PENDING Analysis within the existing dedup window, scores the new item against each, and attaches to the highest-scoring match above a confidence threshold — or creates a new Draft + Story if nothing clears the threshold
- [ ] `extractKeywords` and `discoverCoverage` are removed from `runIngestionPass` entirely — no LLM call, no GDELT/RSS search, anywhere in the Ingestion path
- [ ] A new Draft/Story created because nothing matched is seeded with only the triggering item's own Coverage — no eager search for other outlets at creation time; other outlets' coverage is picked up organically on later polls
- [ ] Human-seeded Discovery (`discoverCoverage`, `extractKeywords`, the Review Step's `verifyCandidatesAgainstAnchor` call) is completely untouched — this ticket only changes the Ingestion path
- [ ] Tests cover: a new item matching an existing open Story's embedding above threshold attaches as Coverage; a new item below threshold for every open Story creates a new Draft + Story; the time-decay factor lowers an otherwise-similar old Story's score enough to prefer creating a new Draft over a stale match
