# 41 — Entity Wikidata Linking

**What to build:** An Admin-only mechanism to link an `Entity` to its corresponding Wikidata item. Admin searches Wikidata by the entity's canonical name, reviews candidate matches, and confirms the correct one — never an automated/unconfirmed match. See [docs/spec-entity-resolution.md](../../../docs/spec-entity-resolution.md).

**Blocked by:** none.

**Status:** ready-for-agent

- [ ] `Entity.wikidataId String?` — nullable, no default, no backfill.
- [ ] New server-side Wikidata search client (mirrors `articleFetchClient.ts`'s one-function shape): calls Wikidata's public search API, returns candidate matches (label, description, Q-id) for a given query string.
- [ ] `GET /api/admin/entities/:key/wikidata-candidates?q=...` (Admin only): proxies the Wikidata search, scoped to one Entity's context.
- [ ] `POST /api/admin/entities/:key/wikidata-link` (Admin only): sets `wikidataId` to a confirmed Q-id.
- [ ] `DELETE /api/admin/entities/:key/wikidata-link` (Admin only): clears a previously-confirmed link.
- [ ] Both actions logged via `AdminActionLog` (`entity.wikidata_linked`, `entity.wikidata_unlinked`).
- [ ] Admin UI: a search-and-confirm flow on the entity's admin view (inline or a dedicated linking page — implementation-time UI judgment).
- [ ] Unit tests for the Wikidata search client, mocking the HTTP call — never hitting the real API in tests.
- [ ] Service-layer tests for link/unlink actions via repository mocks, including the `AdminActionLog` call.
