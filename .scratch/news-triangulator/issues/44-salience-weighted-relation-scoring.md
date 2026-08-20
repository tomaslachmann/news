# 44 — Salience-Weighted Relation Scoring

**What to build:** Wire `StoryEntity.salience` (computed by ticket 12, unused since) into `storyRelationScoring.ts`'s `weightedEntityContainment` — an entity central to a Story's own coverage should contribute more to relation-candidate matching than one mentioned only in passing. See [docs/spec-entity-wiki.md](../../../docs/spec-entity-wiki.md).

**Blocked by:** none — `salience` already exists and is populated (ticket 12).

**Status:** ready-for-agent

- [ ] `EntityForScoring` gains `salience: number`; `findStoryEntitiesForScoring`'s select clause includes it.
- [ ] `weightedEntityContainment`'s per-entity weight changes from `idfWeight(e.storyCount, totalStories)` alone to a function of both IDF weight and salience — exact blend is an implementation-time tunable constant, evaluated against real Story data if any exists by then (the project's DB was empty as of ticket 12).
- [ ] Unit tests: a high-salience entity now contributes more to the score than a low-salience one with identical `storyCount`; existing IDF-only test assumptions updated for the new factor.
- [ ] No other consumer of `storyRelationScoring.ts`'s public scoring function needs to change.
- [ ] New ADR documenting the exact formula chosen and why.
