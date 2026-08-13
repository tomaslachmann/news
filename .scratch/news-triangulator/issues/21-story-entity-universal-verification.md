# 21 — Story Entity & Universal Same-Event Verification

**What to build:** A real, persisted `Story` entity that every candidate article is checked against — with one same-event verification primitive applied uniformly across human-seeded Discovery, Ingestion's new-Draft candidate sourcing, and Ingestion's dedup match — closing the confirmed gap where an Analysis's own Coverage was seeded with unrelated RSS-trending articles. Supersedes ticket 18 / ADR 0015. See ADR 0017 for the full design rationale.

**Blocked by:** 03 — Discovery: GDELT + RSS; 04 — Review Step & Content Extraction; 16 — Automated Article Ingestion.

**Status:** ready-for-agent

- [ ] New Prisma model `Story` (`id`, `createdAt`, `anchorHeadline`); migration adds `Analysis.storyId` (required, unique — one Story per Analysis)
- [ ] `analysisRepo.createAnalysis` (human flow) creates its Story in the same transaction, anchored to the scraped seed article's title
- [ ] `analysisRepo.createDraftAnalysis` (Ingestion flow) creates its Story in the same transaction, anchored to the triggering RSS item's title
- [ ] A shared `verifySameStory(candidateTitle, anchorHeadline)` function — an OpenAI same/different-event judgment call, returning structured `{ sameEvent: boolean, reasoning: string }` — used by all three sites below rather than reimplemented per site
- [ ] `discoverSources` (human flow, `analysisService.ts`): Discovery's candidates are filtered through `verifySameStory` against the Analysis's Story before they're persisted as Coverage / before the Review Step ever shows them
- [ ] `runIngestionPass`'s no-match branch (`ingestionService.ts`): `discoverCoverage`'s candidates are filtered through `verifySameStory` against the triggering article's own title before being persisted as the new Draft's initial Coverage — this is the specific gap that produced the confirmed D8/embassy/Kbelská bug
- [ ] `runIngestionPass`'s match branch: the existing `findRecentAnalysisMatchingUrls` result is confirmed via `verifySameStory` against the matched Analysis's Story before Ingestion attaches/flags anything (carries forward ADR 0015's original scope)
- [ ] A rejected verification at any of the three sites is simply not attached — falls through exactly as a genuine no-match would (new Story for Ingestion's no-match case; excluded from the human Review Step's candidate list)
- [ ] Verification reasoning is logged at all three sites, not discarded, so a wrong verdict is debuggable after the fact
- [ ] `CONTEXT.md`'s `Story` entry updated to describe it as a persisted entity (already done alongside this ticket's ADR)
- [ ] Tests cover: a genuine match confirmed at each of the three sites (existing behavior unchanged); a heuristic candidate rejected by verification at each of the three sites; and a regression test reproducing the confirmed bug — Ingestion sourcing a new Draft's candidates from unrelated RSS-trending items must now exclude them from that Draft's Coverage
- [ ] Existing corrupted Analyses are not fixed by this ticket — flagged as a separate, manual data-cleanup concern, out of scope here
