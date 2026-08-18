# 12 — Entity salience and fuzzy name search

Type: grilling
Status: open
Blocked by: 04

## Question

Spun out of [Entity model: table vs. JSON](04-entity-model-table-vs-json.md) — the audit's §7.3/§8.5 `StoryEntity` schema includes a `salience Float` field ("fraction of this Story's Coverage that mentions the entity") and an `entity_name_trgm` GIN index on `Entity.canonicalName` for fuzzy matching. Neither was built as part of ticket 04's table migration: no salience computation exists anywhere in `entityExtractionPass.ts` today (unlike `confidence`, which is a direct carry-over from the existing JSON shape), and no fuzzy entity-search surface exists to need the index.

Both make sense as their own features, not as unused scaffolding added ahead of anything reading them. Decide:

1. **Salience** — what's the actual product use? The audit frames it as a stronger relation-scoring signal than raw entity-key overlap (an entity every Coverage mentions vs. one mentioned in passing by a single outlet). Is that the motivating use case, or is there a reader/Admin-facing surface that would show it directly?
2. Salience computation needs a per-entity, per-Coverage mention signal — does that require a prompt/schema change to `entityExtractionPass.ts` (currently Story-scoped, not Coverage-scoped, per Coverage output), or can it be derived some other way?
3. **Fuzzy name search** — what surface would use it? An Admin entity browse/search UI doesn't exist yet; is this ticket about building that UI too, or just the index or an accepted trigger for later?
4. Are these two independent enough to split into separate tickets once scoped, or genuinely one ticket?
