# 04 — Entity model: table vs. JSON — revisit ADR 0022?

Type: grilling
Status: open
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
