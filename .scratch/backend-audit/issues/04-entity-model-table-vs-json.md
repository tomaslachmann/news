# 04 — Entity model: table vs. JSON — revisit ADR 0022?

Type: grilling
Status: resolved
Blocked by: none — can start immediately

## Question

**ADR 0022** decided `Story.entities`/`Story.entityRelations` are Story-scoped JSON, not a table, explicitly to avoid taking on entity resolution (deciding that two mentions of "Tusk" across different Stories are the "same" real-world entity).

The audit's §7.3 disputes the *conclusion*, not the *reasoning*: it argues normalizing entities into an `Entity` table with a deterministic `key` (`person:donald-tusk`) doesn't require asserting global identity — the `key` stays a label, exactly as it is today in the JSON form, just stored once and referenced instead of duplicated per-Story. The claimed win: an indexable "all Stories mentioning entity X" query, IDF weighting of entity overlap (fixing **P1-9**, which the audit says is currently wrong for asymmetric entity-set sizes since it uses plain Jaccard), and `story_count` as a materialized frequency table (audit §8.5, §9 has the schema and containment-scoring SQL).

This is a genuine disagreement with a settled, documented decision — not a bug report. Decide:

1. Does ADR 0022's original reasoning actually rule out the table form, or was "JSON not a table" a broader decision than the entity-resolution concern required?
2. If the table form is adopted: this blocks/reshapes **P1-14** (entity extraction sends all full texts unbounded in one call — chunking strategy may differ per storage model) and **P1-15** (one `EXTRACTION_MODEL` env var shared across 5 passes) — note whether those get folded into this ticket's resulting implementation ticket or stay separate.
3. If kept as JSON: is there a lighter-weight fix for P1-9 (IDF weighting) that doesn't require the table migration — e.g. a separate frequency-counting job that doesn't change where entities themselves live?
4. Either way: write the outcome as an ADR (either affirms 0022 with the counter-argument addressed, or supersedes it) — this is exactly the kind of hard-to-reverse, real-trade-off decision `docs/adr/` exists for.

## Notes

This ticket's outcome affects [`Thread` aggregate — now or deferred?](07-thread-aggregate.md), since the audit's proposed `DORMANT → ACTIVE` revival mechanism matches a new Story against a dormant thread's *entity configuration* — which needs entities to be queryable ("all Stories with entity X") to work as designed.

## Answer

ADR 0022's entity-resolution-avoidance reasoning is sound but doesn't rule out the table form: the `key` stays a deterministic label whether it lives in JSON or a row, and `StoryEntityRelation.storyId` keeps the "this Story's own coverage asserts X" semantics on the join row, not the entity. **Adopted the full table form** (audit §7.3/§8.5) — not the lighter frequency-only fix for P1-9 this session initially recommended (that would have left cross-Story entity lookup unbuilt); user's call, choosing to carry the table migration's cost now rather than maintain two entity-frequency mechanisms as interim debt.

Recorded as [ADR 0024](../../../docs/adr/0024-entity-storage-table-not-json.md), which amends ADR 0022 (storage-shape clause only — entity-resolution reasoning, closed relation types, and categorical confidence tiers are all unaffected and still stand).

Scope decided, differing from the audit's Etapa 4 bundle:

- **Built now**: `Entity`/`StoryEntity`/`StoryEntityRelation` tables (`EntityType`/`EntityRelationType` as Prisma enums, matching `StoryRelationType`'s existing convention), IDF-weighted containment replacing `storyRelationScoring.ts`'s plain Jaccard (fixes P1-9), transactional-only `storyCount` maintenance (no correction job — confirmed no delete path exists anywhere for `Story`/`Analysis`/`StoryEntity` today, so no drift is possible; this also avoids a new dependency on ticket 06's still-undecided async queue). Clean cutover: JSON columns dropped outright, no `entitiesLegacy` — DB is empty, entities are write-once, nothing to protect with a dual-write period.
- **Explicitly omitted** as speculative-generality (ADR 0009): `EntityAlias`, `wikidataId`, `salience` (no computation for it exists today — not a carry-over), `entity_name_trgm` fuzzy-search index (no fuzzy-search surface exists). Additive later if something actually needs them.
- **Split into [ticket 11](11-entity-extraction-chunking-and-model-var.md)**: P1-14 (chunked entity extraction) + P1-15 (`ENTITY_MODEL` env var) — both touch `entityExtractionPass.ts`, the same file this migration rewrites, but are independent decisions from the storage shape itself.
- **Split into [ticket 12](12-entity-salience-and-fuzzy-search.md)**: `salience` + trigram fuzzy entity-name search, as their own deferred future features. Ticket only, no ADR — omitting two unbuilt fields isn't the hard-to-reverse, real-trade-off kind of decision ADRs are for.

Implemented on `ticket/audit-04-entity-model-table-vs-json`. Ticket 07 (`Thread`) remains open; its blocker is now resolved (entities are queryable), but whether to actually build `Thread` is still its own undecided question.
