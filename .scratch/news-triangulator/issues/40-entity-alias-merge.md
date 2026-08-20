# 40 — Entity Alias Merge

**What to build:** An Admin-only mechanism to merge two `Entity` rows that turn out to be the same real-world entity (name-variant fragmentation, e.g. "USA" vs. "United States"). Candidates are suggested via the `pg_trgm` fuzzy-name index (ticket 12), an Admin confirms or rejects each suggestion, and a confirmed merge repoints all existing `StoryEntity`/`StoryEntityRelation` rows to the surviving entity. See [docs/spec-entity-resolution.md](../../../docs/spec-entity-resolution.md).

**Blocked by:** none — `entity_canonicalName_trgm_idx` (ticket 12) already shipped.

**Status:** ready-for-agent

- [ ] New `EntityAlias` model: `id`, `entityId` (FK to surviving Entity), `alias`, `mergedFromEntityId`, `createdAt`, `confirmedBy`. `@@unique([alias])`.
- [ ] New `EntityAliasRejection`-shaped tracking (dedicated table or a `status` column on a candidate-pairs concept — exact shape decided at implementation time) so a rejected merge suggestion is excluded from future candidate queries, never re-suggested.
- [ ] `resolveEntityKey(key): key` — returns the surviving key if `key` has a confirmed alias, else `key` unchanged. Every entity-resolution call site in `entityExtractionPass.ts`/`repositories/entity.ts` routes a freshly-derived key through this before upsert/query.
- [ ] Merge action: repoints every `StoryEntity`/`StoryEntityRelation` row from the merged-away `entityId` to the surviving `entityId`, in the same transaction that writes the `EntityAlias` row. The merged-away `Entity` row itself is not deleted.
- [ ] `GET /api/admin/entity-aliases/candidates` (Admin only): ranks candidate same-entity pairs by `pg_trgm` similarity, excluding already-aliased and already-rejected pairs.
- [ ] `POST /api/admin/entity-aliases/:pairId/confirm` and `POST /api/admin/entity-aliases/:pairId/reject` (Admin only).
- [ ] Both actions logged via `AdminActionLog` (`entity.alias_merged`, `entity.alias_rejected`).
- [ ] Admin UI: a candidates list (mirroring `DraftsSection`'s list-plus-action-buttons pattern) with confirm/reject buttons.
- [ ] Integration tests (testcontainers): merge repoints existing rows correctly; a second extraction pass producing the merged-away key resolves to the surviving entity; a rejected pair doesn't reappear in candidates.
