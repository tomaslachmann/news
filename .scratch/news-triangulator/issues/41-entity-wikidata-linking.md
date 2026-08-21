# 41 — Entity Wikidata Linking

**What to build:** An Admin-only mechanism to link an `Entity` to its corresponding Wikidata item. Admin searches Wikidata by the entity's canonical name, reviews candidate matches, and confirms the correct one — never an automated/unconfirmed match. See [docs/spec-entity-resolution.md](../../../docs/spec-entity-resolution.md).

**Blocked by:** none.

**Status:** done

- [x] `Entity.wikidataId String?` — nullable, no default, no backfill.
- [x] New server-side Wikidata search client (mirrors `articleFetchClient.ts`'s one-function shape): calls Wikidata's public search API, returns candidate matches (label, description, Q-id) for a given query string.
- [x] `GET /api/admin/entities/:key/wikidata-candidates?q=...` (Admin only): proxies the Wikidata search, scoped to one Entity's context.
- [x] `POST /api/admin/entities/:key/wikidata-link` (Admin only): sets `wikidataId` to a confirmed Q-id.
- [x] `DELETE /api/admin/entities/:key/wikidata-link` (Admin only): clears a previously-confirmed link.
- [x] Both actions logged via `AdminActionLog` (`entity.wikidata_linked`, `entity.wikidata_unlinked`).
- [x] Admin UI: a search-and-confirm flow on the entity's admin view (inline or a dedicated linking page — implementation-time UI judgment).
- [x] Unit tests for the Wikidata search client, mocking the HTTP call — never hitting the real API in tests.
- [x] Service-layer tests for link/unlink actions via repository mocks, including the `AdminActionLog` call.
- [x] New `EntityImage` model: `id`, `entityId` (FK, `onDelete: Cascade`), `provider` (`EntityImageProvider` enum, v1 declares only `WIKIMEDIA`), `externalId`, `imageUrl`, `thumbnailUrl?`, `author?`, `license?`, `sourceUrl`, `width?`, `height?`, `createdAt`. `@@unique([provider, externalId])`. No `isPrimary` field in v1 (ADR 0034).
- [x] New job `entity.image.enrich` added to the `JobName` registry (`jobDefinitions.ts`, ADR 0028), payload `{ entityId }`, own bounded-backoff retry policy (external HTTP dependency, not an LLM call). Enqueued only after the `wikidataId`-link transaction commits — never from inside it.
- [x] New Wikimedia image-lookup client (mirrors `articleFetchClient.ts`'s one-function shape): given a `wikidataId`, finds and returns the entity's image (url, thumbnail, author, license, sourceUrl, dimensions) if one exists.
- [x] `entity.image.enrich` worker handler: re-reads the Entity's current `wikidataId` by `entityId`, calls the Wikimedia client, creates one `EntityImage` row if found — completes normally (no row, no error) if not found or the call fails.
- [x] Unit tests for the Wikimedia client, mocking the HTTP call — never hitting the real API in tests.
- [x] Service-layer test for the job handler: never throws on a failed/empty fetch; the enqueue call happens only after the linking transaction commits, never inside it.

See [docs/adr/0034-structured-narrative-document.md](../../../docs/adr/0034-structured-narrative-document.md) for why image enrichment is automatic (unlike the Wikidata link itself, which stays Admin-confirmed) and why `isPrimary` is deferred.
