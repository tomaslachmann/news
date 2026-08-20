# Spec — Entity Wiki: Browse, Detail Pages, and Salience-Weighted Scoring

**Triage label:** ready-for-agent

## Problem Statement

Entities exist in this system today (ADR 0022/0024, ticket 12's salience/fuzzy-search work) purely as an internal relation-candidate-scoring signal — `Entity`/`StoryEntity`/`StoryEntityRelation` are never read by anything a reader or Admin sees. Nothing today lets anyone browse "what does this system know about Donald Tusk" or "what other Events mention this entity" — the exact "entity retrieval" and "recommendation by entity configuration" uses `docs/audit.md` describes (even though, as ticket 12's Answer found, that framing doesn't literally trace back to `docs/spec-event-graph.md`'s own text — it's real forward motivation the user has now stated directly, not a re-derivation of an already-approved requirement).

Separately, `StoryEntity.salience` (ticket 12) is computed and persisted but not read anywhere — `storyRelationScoring.ts`'s IDF-weighted containment formula still weighs every entity a Story has by pure rarity, with no notion of how central that entity actually was to that Story's coverage.

## Solution

Two additive pieces:

1. **An entity browse/detail surface** — a search-by-name entry point (using `entity_canonicalName_trgm_idx`, ticket 12) leading to a per-entity page showing: canonical name and type, every Event (Story) that mentions it (via `StoryEntity`, ordered by recency), the entity-to-entity relations it participates in (via `StoryEntityRelation`, aggregated across Events with each relation's own asserting Event linked — never presented as one permanent fact, per ADR 0022's "Story-scoped assertion, not a global fact" principle), and — if `docs/spec-entity-resolution.md` has shipped — its linked Wikidata id/description where present.
2. **Salience wired into `storyRelationScoring.ts`**: `weightedEntityContainment`'s per-entity contribution changes from pure IDF weight to IDF weight scaled by that entity's salience in the Story being scored — an entity central to a Story's coverage (mentioned across most of its sources) should count more toward a relation-candidate match than one mentioned only in passing by a single outlet, which is exactly the improvement ticket 12's grilling session named as salience's motivating use case but deliberately didn't build yet, pending this concrete consuming surface.

## User Stories

1. As a Reader, I want to search for a named entity and find its page, so I can explore what this tool has covered about it, not just about one Event at a time.
2. As a Reader, I want an entity's page to list every Event that mentions it, so I can see the full breadth of coverage involving that entity across time.
3. As a Reader, I want an entity's page to show what it's been asserted to be related to (other entities, and how), so I can understand its context — while each assertion stays traceably tied to the specific Event's coverage that made it, never presented as a standalone verified fact.
4. As a Reader, I want it clear that an entity page is a navigational aggregation of what this tool's coverage has said, not an authoritative biography/encyclopedia entry, so I don't mistake it for more than it is — consistent with ADR 0012's "never assert beyond what's verifiable."
5. As a Reader, I want an Event's own page to link to the entity pages of the entities it mentions, so I can navigate from an Article into the entity graph without a separate search.
6. As a Maintainer, I want relation-candidate scoring to weight an entity's contribution by how salient it was to the Story extracting it, so a Story's own central entities matter more to matching than its incidentally-mentioned ones — the actual motivation ticket 12 built `salience` for.
7. As a Maintainer, I want the exact salience-weighting formula (e.g. `idfWeight × salience`, `idfWeight × (0.5 + 0.5 × salience)`, or another blend) treated as an implementation-time tunable, evaluated against whatever real Story data exists by the time this ships, not locked in this spec.
8. As a Maintainer, I want this scoring change isolated to `weightedEntityContainment`'s own internals, so no other consumer of `storyRelationScoring.ts`'s public scoring function needs to change.
9. As a Maintainer, I want the entity browse/detail read path to be plain, cheap, indexed Postgres queries — no new LLM calls, no new billed cost — since this is a navigation feature over data that already exists.
10. As a Maintainer, I want the entity page's "every Event mentioning this entity" list paginated/bounded (mirroring ticket 03's keyset-pagination precedent), so a very-high-`storyCount` entity (e.g. a country) doesn't return an unbounded result set.
11. As a Reader, I want the public listing/homepage unaffected by this feature — entity pages are an additional navigation surface, not a replacement for the existing Article-first browsing experience.

## Implementation Decisions

- **New route(s)**: a search entry point (e.g. `GET /api/entities?q=...`, using `similarity()`/`%` against `entity_canonicalName_trgm_idx`) and a detail read (e.g. `GET /api/entities/:key`, returning the entity's own fields plus paginated mentioning-Events and aggregated relations). Both public/reader-accessible, no `requireAdmin` gate — entity pages are a reader-facing feature per this spec's own framing, unlike ticket 12's Admin-only fuzzy-search index it reuses.
- **New repository functions** in `repositories/entity.ts`: `searchEntitiesByName(query, limit)`, `findEntityByKey(key)`, `findEventsForEntity(entityKey, { cursor, limit })` (keyset-paginated, mirroring ticket 03's pattern), `findRelationsForEntity(entityKey)`.
- **New frontend route/page**: an entity detail page (route shape e.g. `/entity/:key`) and a search UI (a dedicated search page or a search box surfaced from the existing nav bar — left to implementation-time UI judgment). `AnalysisPage.tsx`'s existing entity mentions (once extracted per Event) gain links to each entity's page — the exact mention-to-entity-key mapping needed for this link already exists in `StoryEntity`, no new extraction needed.
- **`weightedEntityContainment` change**: `EntityForScoring` (currently `{key, storyCount}`) gains `salience: number`; `findStoryEntitiesForScoring`'s select clause is extended to include it (a one-line addition — `confidence` remains deliberately unselected, unaffected by this change). The per-entity weight computation changes from `idfWeight(e.storyCount, totalStories)` to a function of both `idfWeight` and `e.salience`; exact blend is an implementation-time constant (see User Story 7).
- **Assertion framing on the entity page**: each `StoryEntityRelation` shown is rendered with the asserting Event linked directly beside it (e.g. "asserted by [Event title]"), never as a bare fact list — matching how the rest of this tool already attributes every claim back to its source (the project's core principle, CLAUDE.md).
- **New ADR expected at implementation time**, documenting: the salience-weighting formula chosen and why, and the decision to make entity pages reader-facing (not Admin-gated) despite the underlying data being an internal scoring signal originally (ADR 0022's "never surfaced to a reader" framing for `confidence`/`salience` is explicitly revised by this spec, not silently contradicted — the ADR should say so).

## Testing Decisions

- `searchEntitiesByName`/`findEventsForEntity`/`findRelationsForEntity`: integration-tested against a real Postgres instance via testcontainers, mirroring `test/integration/entity.test.ts`.
- `weightedEntityContainment`'s updated formula: unit-tested directly (it's a pure function today, per `storyRelationScoring.ts`), asserting a high-salience entity now contributes more to the score than a low-salience one with identical `storyCount`, and that the existing IDF-only tests' assumptions are updated to account for the new factor.
- New routes: service-layer tests via repository mocks, mirroring `analysisService.test.ts`'s pattern for read endpoints.
- Frontend: no new test infrastructure, matching ticket 33/37's precedent (vitest configured, no component tests exist yet in this codebase).

## Out of Scope

- Anything from `docs/spec-entity-resolution.md` (aliasing, Wikidata linking) — this spec's entity page works with today's raw `Entity`/`StoryEntity` data and degrades gracefully (no Wikidata section rendered) if that sibling spec hasn't shipped yet.
- Entity-based recommendation ("Events you might also be interested in, based on entities you've read about") — the audit's "doporučování" framing, explicitly not re-derived as a requirement here; would need a notion of reader identity/history this project doesn't have.
- A dedicated "all entities" browse/directory page (as opposed to search-by-name) — search is the entry point in this wave; a full directory is additive later if search proves insufficient.
- Editing entity data from the reader-facing page (this is a read-only navigation surface; any future entity editing is Admin-only and this spec's sibling's concern).
- Entity page SEO/canonical-URL considerations beyond what the rest of this SPA already does.
- Any change to Extraction/Synthesis or the Article page's existing four-dimension breakdown — this is a purely additive navigation layer over already-extracted entity data.

## Further Notes

Sibling to `docs/spec-entity-resolution.md` — see that spec's Further Notes for the shared origin (a direct user-stated "entity knowledge graph/wiki" direction, checked against `docs/audit.md`/`docs/spec-event-graph.md` during ticket 12's grilling session). This spec's entity page is the concrete consuming surface ticket 12's Answer named as the reason salience-scoring integration was deliberately deferred rather than built alongside salience computation itself — landing this spec is what unblocks that follow-up.

The exact salience-weighting blend (User Story 7) is intentionally left open — this project's database is still empty of real production data (confirmed directly during ticket 12's fact-finding: `Entity`/`StoryEntity`/`Story` all at 0 rows), so any specific formula chosen now would be tuned against nothing. Revisit with real data once this ships.
