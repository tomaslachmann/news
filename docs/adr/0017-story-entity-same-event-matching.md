# ADR 0017 — Story as a first-class entity for same-event matching

## Status
Accepted. Supersedes ADR 0015.

## Context
A production Analysis confirmed exactly the risk ADR 0013 flagged but only partially closed. Its seed article failed to scrape entirely, and its Coverage was seeded with eight completely unrelated RSS-trending articles — a truck crash on D8, a port explosion in Rotterdam, Spotify's AI-artist labeling, a sports interview, a lawsuit against the Russian embassy, a public-salary policy change, and two unrelated road-closure notices. Extraction and Synthesis ran over all of it, producing a reader-facing "Article" that stitched together facts from eight unrelated events.

ADR 0015 addressed only the narrower case of Ingestion's dedup match against an *already-existing* Analysis. This bug originated earlier, at the point Ingestion sources candidate Coverage for a *brand-new* Draft — a gap ADR 0013 explicitly named and left open: "RSS-fallback candidates are still used to seed a new Draft's Coverage, just never trusted for the dedup decision." The identical gap exists in the human-seeded flow: Discovery's GDELT/RSS candidates reach the Review Step with no automated same-event check at all, relying entirely on a human catching a bad match — a defense that doesn't exist for Ingestion at all, since nothing shows a human the candidate list before it becomes Coverage.

`Story` — the real-world event a Coverage is actually about — has existed in `CONTEXT.md` since early on, but only as an implicit idea. `Coverage` attaches directly to `Analysis`; nothing durable represents "these articles are believed to be the same event," independent of Analysis's own pipeline-state lifecycle.

## Decision
`Story` becomes a real, persisted entity — one row per real-world event, holding an `anchorHeadline` (the seed or triggering article's title, fixed at creation) that every same-event comparison is made against. `Analysis` gains a required, unique `storyId`, created in the same transaction as the Analysis itself. Story and Analysis still come into existence at the same moment they do today — a human seed, or an unmatched Ingestion item — so ADR 0013's eager-Draft-visibility goal is untouched. What changes is that the entity representing "this cluster of articles is the same event" now has its own identity and name, independent of Analysis's DRAFT/PENDING/COMPLETE/FAILED lifecycle, rather than being folded into it.

`Coverage` keeps its existing `analysisId` foreign key unchanged. Story is reached transitively via `coverage.analysis.storyId`, not through a second, parallel Coverage FK — this avoids the schema and repository migration a direct `Coverage.storyId` would force across every existing call site, while still giving Story everything it needs to do its one job.

One `verifySameStory(candidateTitle, story.anchorHeadline)` primitive — the OpenAI same/different-event judgment call originally scoped in ADR 0015 — becomes the single mechanism used everywhere an article is about to become Coverage on some Story, replacing three previously separate, differently-trusted heuristics:

1. **Human-seeded Discovery's candidate list** — filtered before being offered at the Review Step. Previously: no automated check at all; a human was the only defense.
2. **Ingestion's candidate sourcing for a brand-new Draft** — filtered before being persisted as that Draft's initial Coverage. Previously: unverified per ADR 0013. This is the gap that produced the confirmed bug.
3. **Ingestion's dedup match against an existing Story/Analysis** — ADR 0015's original scope, carried forward with the same mechanism, now framed as "verify against the Story" rather than "verify against the Analysis."

A rejected verification, at any of the three sites, is simply not attached — it falls through exactly as a genuine no-match would (a new Story for Ingestion's no-match case; excluded from the Review Step's candidate list for the human case).

## Consequences
- One Prisma migration: a new `Story` table, plus `Analysis.storyId` (required, unique).
- `createAnalysis` and `createDraftAnalysis` both gain a Story-creation step. Anywhere matching logic reads a headline, it should read `story.anchorHeadline`, not `analysis.seedHeadline` — identical value at creation time, but the two are expected to diverge in purpose as Story becomes independently correctable (e.g. relabeling a mis-anchored Story) without touching Analysis's own reader-facing field.
- Each of the three attach points gains one bounded extra LLM call, only when a URL/keyword-heuristic candidate is already found — preserves ADR 0013's "no LLM cost until Draft approval" invariant for the common no-candidate case.
- Existing mis-clustered Analyses (like the confirmed example) are not automatically fixed by this change — cleaning up already-corrupted data is a separate, manual concern.
- `CONTEXT.md`'s `Story` entry needs an addendum: it is now a persisted entity with real matching mechanics, not just a description of an implicit relationship.
