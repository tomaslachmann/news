# ADR 0024 — Entity storage: normalized tables, not Story-scoped JSON

## Status
Accepted

## Context
ADR 0022 decided `Story.entities`/`Story.entityRelations` are Story-scoped JSON columns, not a global `Entity` table, specifically to avoid taking on entity resolution — deciding whether "Tusk" in one Story and "Donald Tusk" in another are the same real-world person. That reasoning was sound but, per `docs/audit.md` §7.3 (folded into the wayfinder map as [Entity model: table vs. JSON](../../.scratch/backend-audit/issues/04-entity-model-table-vs-json.md)), the *conclusion* didn't actually follow from it: normalizing entities into a table with a deterministic `key` doesn't require asserting global identity. The `key` (`type:slugify(canonicalName)`, e.g. `person:donald-tusk`) stays exactly the label it is today — the only change is storing it once and referencing it, instead of duplicating it inside every Story's JSON blob.

Two concrete problems motivated revisiting this:

- **P1-9**: `storyRelationScoring.ts` scores entity overlap with plain Jaccard, which is the wrong metric for this project's actual input asymmetry — Ingestion's entity extraction runs over 2–5 entities (anchor + candidate headlines only), the human-seeded path over 30–50 (full Coverage texts). Jaccard penalizes exactly this size asymmetry: 3 entities fully contained in 40 score 0.075, below threshold, despite perfect containment. Fixing this properly needs IDF weighting, which needs a global per-entity frequency — something a JSON column cannot expose as an indexed, queryable aggregate.
- No indexed "all Stories mentioning entity X" query is possible over a JSON column, which is what ticket 07 ([`Thread` aggregate](../../.scratch/backend-audit/issues/07-thread-aggregate.md)) would need for its proposed `DORMANT → ACTIVE` revival (matching a new Story against a dormant thread's entity configuration) if that ticket is ever built.

## Decision
**Entities and entity-relations move to normalized tables**, replacing `Story.entities`/`Story.entityRelations`:

```prisma
model Entity {
  id         String     @id @default(cuid())
  key        String     @unique   // "person:donald-tusk" — deterministic label, not verified identity
  type       EntityType
  canonicalName String
  storyCount Int        @default(0) // materialized frequency, for IDF weighting
  @@index([type])
}

model StoryEntity {
  storyId    String
  entityId   String
  confidence Float
  @@id([storyId, entityId])
  @@index([entityId])              // the query a JSON column can't do: "all Stories with entity X"
}

model StoryEntityRelation {
  id           String             @id @default(cuid())
  storyId      String             // the assertion belongs to THIS Story, not to the entities globally
  fromEntityId String
  toEntityId   String
  type         EntityRelationType // closed enum, unchanged from ADR 0022
  confidence   Float
  @@unique([storyId, fromEntityId, toEntityId, type])
  @@index([fromEntityId])
  @@index([toEntityId])
}
```

`EntityType`/`EntityRelationType` become Prisma enums, matching the project's existing convention (`StoryRelationType`, `StoryRelationConfidenceTier`) and reusing the exact closed value sets already defined as Zod schemas in `entityTypes.ts` — no new taxonomy.

What is deliberately **not** built now, because nothing in this ticket's scope uses it: `EntityAlias` (an entity-resolution/aliasing layer ADR 0022 already deferred as "additive, not a data-shape migration" if/when needed), `wikidataId` (unused placeholder for a future linking feature), `salience` (no per-Coverage salience computation exists today — a new ticket, not a carry-over), and a trigram fuzzy-search index on `canonicalName` (no fuzzy entity-search surface exists). All four are additive later, not foreclosed by this decision.

`storyCount` is maintained by a transactional increment in the same write as the `StoryEntity` insert — no periodic drift-correction job. The codebase has no delete path for `Story`, `Analysis`, or `StoryEntity` anywhere today, so there is no source of drift to correct; if deletion is ever introduced, that is the trigger to add decrement logic and reconsider a correction job, not something to build speculatively now.

Migration is a clean cutover: the JSON columns are dropped outright, with no `entitiesLegacy` transitional column. The database is empty and entities are write-once at extraction time with no backfill path, so there is nothing a dual-write period would protect.

Two pieces of related audit findings are explicitly out of this ticket's scope, split into their own tickets: P1-14 (entity extraction sends all full texts in one unbounded LLM call) and P1-15 (`EXTRACTION_MODEL` shared across five passes) → [ticket 11]; `salience` and trigram search → [ticket 12].

## Consequences
- ADR 0022's entity-resolution-avoidance reasoning and its other two decisions (closed `StoryRelation` types, categorical confidence tiers) are unaffected and remain in force — this ADR narrows ADR 0022 to its storage-shape clause only. ADR 0022 has been amended with a pointer to this ADR.
- `storyRelationScoring.ts` can now compute IDF-weighted containment instead of plain Jaccard for entity/entity-relation overlap, fixing P1-9's asymmetric-set-size problem.
- "All Stories mentioning entity X" becomes a single indexed query, unblocking ticket 07's proposed `Thread` revival mechanism if that ticket is later accepted — this ADR does not itself decide whether `Thread` gets built.
- Two entity-key collisions (two distinct real-world entities normalizing to the same label) remain possible and are still an accepted v1 limitation, unchanged from ADR 0022 — normalizing storage does not change what the `key` means or guarantees.
- `Story.entities`/`Story.entityRelations` no longer exist as of this migration; any code or query still assuming the JSON shape must be updated as part of the implementing ticket.
