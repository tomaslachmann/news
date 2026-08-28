# ADR 0041 — The entity page shows external encyclopedic context, clearly marked as external

## Status
Accepted

## Context
`docs/spec-entity-wiki.md` (ticket 42/43) built the entity page as "a navigational aggregation of
what this tool's coverage has said, not an authoritative biography/encyclopedia entry" (User Story
4), and its Implementation Decisions section explicitly anticipated "a New ADR expected at
implementation time" once the page grew beyond bare name/type/mentions.

Ticket 90 is that growth: the user asked for the page to carry "some information about that entity
as well, not just name" — a description, an image, stats. The tension is direct. This project's
whole premise (CLAUDE.md, ADR 0012) is that it never asserts beyond what its sources verifiably
say and never adjudicates; an entity page that reads like a Wikipedia infobox risks a reader
taking its prose as *this tool's* claim about the entity, which it is not and must not be.

Three sources of "information about the entity" were considered:
1. **Wikidata's one-line description** (`český politik a politolog`) — already returned by
   `searchWikidataEntities` at Admin link-confirm time, thrown away until now.
2. **The Czech Wikipedia intro extract** — a free REST call, 2–4 sentences of plain text.
3. **An LLM-authored summary of what this tool's own coverage has said about the entity.**

## Decision
**Show (1) and (2) — external, attributed, and visually fenced off. Do not build (3).**

- The Wikidata description and Wikipedia extract are fetched best-effort by the
  `entity.image.enrich` job (only ever for an entity an Admin has already linked to Wikidata) and
  persisted on `Entity`. Never fetched or inferred automatically for an unlinked entity.
- On the page they render in a bordered, amber-ruled block labelled **"Kontext z Wikipedie"** with
  the standing note *"Externí encyklopedický text — ne zpravodajství tohoto nástroje"* and a link
  out to the full Wikipedia page. The same visual "external, handle with context" cue the ticket-87
  Draft-exclusion banner uses. It is never mixed into the tool's own sections (mentioning Events,
  asserted relations), which keep their existing per-claim attribution (ADR 0022).
- The Wikimedia photo is likewise credited (author · license · source link), same as the Narrative
  lead image (ticket 51).
- Stats shown (`eventCount`, first/last mention, `relationCount`, co-mentions, mention timeline)
  are all derived from *this tool's own corpus* over COMPLETE Analyses — they are facts about the
  coverage, not about the entity, and need no external attribution.
- **No LLM-authored entity summary.** It would be the tool speaking in an encyclopedic voice about
  an entity rather than about a story — the exact authoritative-biography framing User Story 4
  rules out — and it carries a per-entity billed cost for a navigation feature the spec says must
  stay "plain, cheap, indexed Postgres" (User Story 9). If a synthesized entity overview is ever
  wanted, it needs its own spec and its own defense against the adjudication concern, not a
  silent addition here.

## Consequences
- An entity page has two clearly separated registers: an external-context block (Wikipedia/
  Wikidata, fenced and labelled) and the tool's own aggregation (mentions, relations, stats). A
  reader can always tell which is which.
- External context only ever appears for Admin-linked entities. An unlinked entity's page is
  exactly as before plus the corpus stats — no degraded/empty "context" section.
- Stale external prose is a real risk (Wikipedia changes; we fetch once). `clearEntityWikidataId`
  drops the cached context on unlink so a re-link refetches; a periodic refresh is not built (same
  no-backfill / revisit-with-real-data posture as ADR 0021), and the failure mode — slightly dated
  encyclopedic text, clearly marked as external — is low-stakes.
- The LLM-summary door stays closed by decision, not by omission — a future ticket proposing one
  starts from this ADR's reasoning, not a blank slate.
