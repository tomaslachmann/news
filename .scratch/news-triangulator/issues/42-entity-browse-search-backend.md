# 42 — Entity Browse/Search Backend

**What to build:** Reader-facing (not Admin-gated) read endpoints for searching entities by name and viewing one entity's detail: every Event that mentions it, and the entity-to-entity relations it participates in. See [docs/spec-entity-wiki.md](../../../docs/spec-entity-wiki.md).

**Blocked by:** none — degrades gracefully without ticket 40/41 (no alias/Wikidata data to show yet, just omits those sections).

**Status:** ready-for-agent

- [ ] `searchEntitiesByName(query, limit)` in `repositories/entity.ts` — uses `entity_canonicalName_trgm_idx` (`similarity()`/`%`).
- [ ] `findEntityByKey(key)` in `repositories/entity.ts`.
- [ ] `findEventsForEntity(entityKey, { cursor, limit })` — keyset-paginated (mirrors ticket 03's pattern), ordered by recency.
- [ ] `findRelationsForEntity(entityKey)` — every `StoryEntityRelation` the entity participates in, each row including the asserting Story's own id/display-title so it can be shown attributed, not as a bare fact.
- [ ] `GET /api/entities?q=...` (public, no auth) — search endpoint.
- [ ] `GET /api/entities/:key` (public, no auth) — detail endpoint: entity fields, paginated mentioning Events, aggregated relations.
- [ ] Service-layer tests via repository mocks.
- [ ] Integration tests (testcontainers) for the repository functions, including pagination behavior on a high-`storyCount` entity.
