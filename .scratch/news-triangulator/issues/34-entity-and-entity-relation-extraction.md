# 34 — Entity & Entity-Relation Extraction

**What to build:** Every Story gets a small set of extracted named entities and entity-to-entity relations, generated once, as cheap structural evidence for the relation-linking work that follows in ticket 35. Not a knowledge graph, not authoritative real-world identity resolution — Story-scoped JSON evidence, generated from the richest source text realistically available to each pipeline path before Extraction/Synthesis runs. This ticket makes the data exist and be verifiable via DB inspection; it isn't consumed by anything user-facing yet.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `Story` gains two new nullable/default-empty JSON columns: `entities` (array of `{ key, name, type, confidence }`, `type` one of `PERSON`/`ORGANIZATION`/`PLACE`/`COUNTRY`) and `entityRelations` (array of `{ from, to, type, confidence }`, `from`/`to` are entity keys, `type` drawn from a small closed enum — candidates: `REPRESENTS`, `HOLDS_POSITION_IN`, `WORKS_FOR`, `MEMBER_OF`, `LOCATED_IN`, `BASED_IN`, `PART_OF`, `INVOLVES`, `MEETS`, `ATTACKS`, `ACCUSES`, `ANNOUNCES` — pick a final ~8–12 during implementation)
- [ ] A new pass module exports a function that takes a Story's available source text and calls the shared `callJsonModel` LLM client, returning `{ entities, entityRelations }` validated against a zod schema with closed enums — malformed/out-of-enum responses are rejected, not silently coerced
- [ ] `llmClient.ts`'s `LlmCallSite` union gains a new value for this pass, so its calls are automatically covered by the existing durable LLM-call logging (ADR 0020) — no separate wiring
- [ ] The LLM call returns `{ mention, canonical_name, type }` per entity — it normalizes the name but never invents a key and never asserts global identity
- [ ] A separate, pure, deterministic function derives each entity's `key` as `type + ':' + slugify(canonical_name)` — same normalized name always produces the same key, independent of which call produced it; the LLM never generates a key directly
- [ ] Entity-relation extraction is explicit that a relation is what *this Story's coverage* asserts, not a general/global fact about the entities involved — enforced by storage shape alone (Story-scoped JSON), no additional runtime check needed
- [ ] For an Ingestion-originated Story: this pass runs inside `approveDraft`, alongside the existing pre-Extraction quality gate (ticket 24) — input is the Story's `anchorHeadline` plus the RSS titles of every attached Coverage at that point
- [ ] For a human-seeded Story: this pass runs inside `confirmCoverages` (Review Step confirmation), not at Analysis creation — `confirmCoverages` already scrapes every confirmed source's full text as part of its existing flow, so entity extraction there gets real multi-source `extractedText` as input, richer than what's available at creation time. Still strictly before Extraction/Synthesis
- [ ] A failure in this pass (LLM error, malformed response) degrades gracefully — logged, `entities`/`entityRelations` left empty — and never blocks `approveDraft`'s Draft→PENDING transition or `confirmCoverages`'s existing confirmation flow
- [ ] No backfill: existing Stories keep `entities`/`entityRelations` empty; only Stories processed after this ships get them populated
- [ ] The pass module is unit-tested by mocking `llmClient.js`'s `callJsonModel`, matching `headlinePass.test.ts`/`extractionPass.test.ts`'s existing pattern
- [ ] The canonical-key derivation is unit-tested directly as a pure function (no mocking) — same input always produces the same key
- [ ] `approveDraft`'s and `confirmCoverages`'s new step is tested at the service layer via repository mocks, mirroring `ingestionService.test.ts`/`analysisService.test.ts`'s existing pattern — asserting the step runs at the right point and that a failure in it doesn't block the existing flow
- [ ] Existing tests for `approveDraft`, `confirmCoverages`, and their surrounding flows keep passing without meaningful behavior changes beyond what this ticket's new step requires

## Notes

Spec: `docs/spec-event-graph.md`. First of a four-ticket chain (34 → 35 → {36, 37}). The full rationale for the entities-as-JSON (not a table) decision and the deterministic-key-not-verified-identity decision will be written up as an ADR in ticket 35, once `StoryRelation` (the other half of the data model this decision covers) also exists — don't write a standalone ADR in this ticket.
