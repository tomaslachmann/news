# 40 — Entity Alias Merge

**What to build:** An Admin-only mechanism to merge two `Entity` rows that turn out to be the same real-world entity (name-variant fragmentation, e.g. "USA" vs. "United States"). Candidates are suggested via the `pg_trgm` fuzzy-name index (ticket 12), an Admin confirms or rejects each suggestion, and a confirmed merge repoints all existing `StoryEntity`/`StoryEntityRelation` rows to the surviving entity. See [docs/spec-entity-resolution.md](../../../docs/spec-entity-resolution.md).

**Blocked by:** none — `entity_canonicalName_trgm_idx` (ticket 12) already shipped.

**Status:** ready-for-agent

- [x] New `EntityAlias` model: `id`, `entityId` (FK to surviving Entity), `alias`, `mergedFromEntityId`, `createdAt`, `confirmedBy`. `@@unique([alias])`. Also made `mergedFromEntityId` `@unique` (not in the ticket's own field list) — an entity merged away once is never selected as a merge target again, and the constraint makes that invariant enforced at the DB level, not just by the candidate query's own exclusion filter. See ADR 0033.
- [x] `EntityAliasRejection` — a dedicated table (`entityIdA`/`entityIdB` in a fixed order, `@@unique`), not a status column: a rejected pair is two entity ids with no natural "survivor" the way a confirmed `EntityAlias` row has, so it doesn't fit `EntityAlias`'s own shape.
- [x] `resolveEntityKey(key): key`. Landed differently from the letter of this bullet: rather than a second resolution call inside `entityExtractionPass.ts`, resolution (plus same-batch collision-merging, so two raw keys resolving to one survivor produce exactly one `storyCount` adjustment) happens once, inside `replaceStoryEntities` itself — the actual persistence boundary, and the one place resolution has to happen for correctness to hold regardless of which upstream caller forgot to resolve first. `resolveEntityKey` is an injected dependency there (default: identity), wired to the real implementation only at `worker.ts`. See ADR 0033's Consequences.
- [x] Merge action (`mergeEntities`, `repositories/entityAlias.ts`) — repoints `StoryEntity`/`StoryEntityRelation` rows, same transaction as the `EntityAlias` write. Also flattens any alias that already pointed at the merged-away entity onto the new survivor (the chained-merge case ADR 0033 documents), and drops a `StoryEntityRelation` row instead of repointing it when doing so would produce a self-relation or duplicate — both would otherwise violate a DB constraint.
- [x] `GET /api/admin/entity-aliases/candidates`.
- [x] `POST /api/admin/entity-aliases/:pairId/confirm` (body: `{ survivingEntityId }` — not in the ticket's own route sketch, but a merge needs the Admin to pick which canonical name survives; there's no other way to decide) and `POST /api/admin/entity-aliases/:pairId/reject`.
- [x] Both actions logged via `AdminActionLog` (`entity.alias_merged`, `entity.alias_rejected`).
- [x] Integration tests (testcontainers, `test/integration/entityAlias.test.ts` + new cases in `entity.test.ts`): merge repoints existing rows correctly (including the dedup/self-relation-drop edge cases above); `resolveEntityKey` resolves the merged-away key to the survivor, including through a chained merge; a rejected pair doesn't reappear in candidates and rejecting twice is idempotent. Also verified against a live backend with real extracted dev data (the trigram query found genuine fragmentation: "Česká společnost pro větrnou energii" vs. "...(ČSVE)" at 0.90 similarity) and confirmed the confirm/reject routes' validation paths (malformed pairId, missing body field, unauthenticated) — the actual merge/reject actions were not exercised against real dev data to avoid an irreversible mutation of it; the transaction itself is already covered end-to-end by the real-Postgres integration tests.

## Notes

Admin UI (candidates list, mirroring `DraftsSection`'s list-plus-action-buttons pattern) split out
into ticket 46 — this ticket ships the backend (model, migration, `resolveEntityKey`, merge
mechanics, candidate query, routes) end to end and is independently mergeable/testable via the API
directly; the frontend is a separate, later pass rather than blocking this one.

`/code-review` on the first pass caught three real gaps in `mergeEntities`, all fixed and covered
by new tests before this ticket closed: `survivingEntityId` itself being already merged away (a
stale candidate list) landed the new alias on an inert entity instead of the true current
survivor; a genuine concurrent double-confirm hit a raw Prisma unique-constraint error instead of
the documented `AlreadyMergedError`, since the pre-check-then-insert wasn't atomic under READ
COMMITTED; and `resolveEntityInputs` resolved each distinct key sequentially instead of in
parallel. Fixing the first two also surfaced that a merged-away entity's own `storyCount` was left
stale at its pre-merge value rather than zeroed, which is now fixed too.
