# ADR 0035 — Entity browse/detail pages are reader-facing, not Admin-gated

## Status
Accepted

## Context
`Entity`/`StoryEntity`/`StoryEntityRelation` (ticket 34, ADR 0024) were introduced purely as an
internal candidate-scoring signal for Story-relation matching (ticket 35). ADR 0022 says so
explicitly: "Per-entity/per-entity-relation extraction confidence, added in ticket 34, is a
different, lower-level concept: a raw float used only internally as a candidate-scoring input,
**never surfaced to a reader or Admin**." Ticket 12's fuzzy-search index
(`entity_canonicalName_trgm_idx`) was itself built for an Admin-only workflow — same-entity alias
candidates (ticket 40) — not for a reader.

`docs/spec-entity-wiki.md` (ticket 42) adds `GET /api/entities?q=...` and `GET /api/entities/:key`
with no `requireAdmin` gate: a reader can now search for an entity by name and see every Event
(Story) that mentions it plus every entity-relation it participates in, each attributed to the
Event whose coverage asserted it. This is the exact "never surfaced to a reader" boundary ADR 0022
drew, and the spec's own Implementation Decisions section calls for a documented decision here
rather than a silent contradiction.

## Decision

**Entity pages are reader-facing, no auth gate — this revises, not merely extends, ADR 0022's
posture.** The fields exposed are deliberately narrow: `Entity.canonicalName`/`type`/`storyCount`/
`wikidataId`, and `StoryEntityRelation.type` alongside the two entities it connects. Two fields ADR
0022/ticket 12 kept explicitly internal — `StoryEntity.confidence` and `StoryEntity.salience` —
stay internal: neither `findEventsForEntity` nor `findRelationsForEntity` selects them, and neither
appears in `EntityDetail`/`EntityEventItem`/`EntityRelationItem` (`@news-triangulator/shared`).
What changes is not "raw scoring internals are now public" but "the same aggregation these tables
already computed — which entities exist, which Events mention them, which relations were asserted
— is worth a reader-facing navigation surface," per `docs/spec-entity-wiki.md`'s own framing
(User Stories 1–5).

**Every relation stays attributed, never a bare fact.** `findRelationsForEntity` returns one row
per `StoryEntityRelation`, each carrying its own asserting Event's `analysisId`/display title — not
deduped or presented as a standalone verified fact about the entity. This is the same attribution
principle CLAUDE.md states as this project's core purpose, and the same "Story-scoped assertion,
not a global fact" posture ADR 0022 already established for `StoryRelation`; ticket 42 just extends
it to entity-relations' own reader-facing presentation, which didn't exist before this ticket.

**Public reads are bounded by `COMPLETE` status, mirroring `GET /api/analyses`.** A Draft/Pending
Analysis isn't a stable Article a reader can land on yet, so `findEventsForEntity`/
`findRelationsForEntity` only surface Events whose Analysis has reached `COMPLETE` — the same rule
`GET /api/analyses` already applies to a non-Admin reader (`analysisRepo.findAnalysesPage`).

## Consequences
- `Entity.canonicalName`/`type`/`storyCount`, `Entity.wikidataId` (ticket 41), and
  `StoryEntityRelation.type` (plus the two entities it connects) are now public data, readable by
  anyone with no auth — a narrowing of ADR 0022's "never surfaced" framing that future tickets
  touching these tables need to account for (e.g. a field added to `Entity` for internal-only
  scoring purposes is not automatically safe to expose without the same review this ADR gave the
  ticket 42 fields).
- `StoryEntity.confidence`/`salience` remain the one boundary ADR 0022 drew that this ticket does
  not revise — still internal-only, still absent from every ticket-42 repository row and API
  response type.
- A future entity-editing surface (correcting a `canonicalName`, re-linking a Wikidata id) is
  explicitly out of scope for this reader-facing read path (`docs/spec-entity-wiki.md`'s Out of
  Scope) and would need its own `requireAdmin` gate, same as ticket 40/41's existing Admin routes.
