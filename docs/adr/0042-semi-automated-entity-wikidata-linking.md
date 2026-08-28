# ADR 0042 — Semi-automated entity → Wikidata linking: a deterministic auto-link gate plus a review queue

## Status
Accepted

## Context
`docs/spec-entity-resolution.md` User Story 11 and ADR 0022's entity-resolution-avoidance reasoning
made every `Entity.wikidataId` link a manual Admin action: "Wikidata's own disambiguation problem
(many entities share names) makes an unconfirmed automatic match exactly the kind of unverifiable
assertion ADR 0012 exists to prevent." That stance shipped in ticket 41.

Ticket 93 revisits it against `docs/research/2026-automated-entity-wikidata-linking.md`, a
first-party investigation of the Wikidata Action/REST APIs, the W3C Reconciliation spec, the
OpenRefine-Wikibase service, and the OpenTapioca paper. The research's headline finding: the
manual stance is right for the *hard* cases but is applied uniformly to cases that are not hard at
all. A `PERSON` whose exact Czech name has one human bearer who owns the `cswiki` article of that
name, a `COUNTRY`, a major `ORGANIZATION` — these can be linked by a deterministic rule with a
false-positive rate low enough to auto-accept, while everything ambiguous falls to a review queue.
No LLM is needed for the confident path.

## Decision

**Keep every link Admin-confirmed by default (ADR 0022 stands), but add a narrow deterministic
auto-link fast-path plus a suggestion queue for the rest** — the same "auto-accept the confident
ones, queue the ambiguous ones" pattern this repo already uses for `StoryRelation` LOW-confidence,
`PendingAddition`, and Draft review.

### The scheduled scan (`entity.wikidata.scan`)
A daily pg-boss cron job (04:30 Europe/Prague, singleton, no immediate on-boot send — it makes
external calls). Each run loads unlinked entities with `storyCount >= WIKIDATA_SCAN_MIN_STORY_COUNT`
that have no fresh suggestion, capped at `WIKIDATA_SCAN_MAX_PER_RUN`; the remainder roll to the
next run and are logged. Per entity, **serially** (polite one-at-a-time Wikidata access, research
§5, honest contact User-Agent — *not* ADR 0040's browser headers):

1. `wbgetentities&sites=cswiki&titles=<canonicalName>` — resolve the Czech Wikipedia article title
   to one Q-id (unique per language, unlike Wikidata labels — the strongest cheap signal).
2. `action=query&list=search&srsearch="<name>" haswbstatement:P31=<type Q-ids>` — the
   type-constrained candidate list and rival check. `haswbstatement` does not walk `P279*`, so the
   type Q-id set is enumerated per entity type (`TYPE_P31_QIDS`), tunable like `MATCH_THRESHOLD`.
3. Batch `wbgetentities` on the rest for scoring.

### The six-condition auto-link gate (`evaluateAutoLink`)
Auto-link **iff all six hold** for the primary candidate (the cswiki-resolved item, or the
top-scored hit when there was no cswiki page at that title):

1. exact normalized Czech label/alias match (not fuzzy);
2. `P31` type coherent with the entity's type;
3. a `cswiki` sitelink present;
4. not a Wikimedia-internal page (disambiguation/category/template/list);
5. no rival candidate that *also* has both an exact name match and a coherent type;
6. **the hosted reconciliation service independently returns the same Q-id with `match: true`.**

Condition 6 is a non-blocking cross-check against `wikidata-reconciliation.wmcloud.org/cs/api`
(OpenRefine's shipped default; its own "score > ~95 AND beats #2 by > 10" rule, research §3.3). It
is a volunteer-run service with no published rate limits, so a 429 / timeout / any non-OK surfaces
as `ReconcileUnavailableError` and the entity goes to the **queue** — silence is never treated as
agreement, and the scan never auto-links on our gate alone.

On a pass: write `wikidataId`, record `AdminActionLog` `entity.wikidata_autolinked` with
`actorId = 'system:auto-wikidata'` (distinct from an Admin's `entity.wikidata_linked`), enqueue
`entity.image.enrich` — exactly what the manual link does.

### The suggestion queue
Everything else becomes an `EntityWikidataSuggestion` row (one per entity, `candidates` JSON ranked
by a weighted score used *only* for ordering — label 60 / type 25 / cswiki 10 / popularity 5). A
later scan overwrites it; it is deleted the moment an Admin acts. `/admin/entity-wikidata-suggestions`
lets an Admin confirm a candidate (→ `entity.wikidata_linked`, same as manual), reject one
candidate permanently, or dismiss the whole set. A rejection writes an
`EntityWikidataCandidateRejection` row (`@@unique([entityId, qid])`, permanent — mirrors
`EntityAliasRejection`); the scan filters these out, so an identical candidate set never comes
back while a genuinely new candidate still can.

### No LLM on the auto path
None of the six conditions needs one. An LLM disambiguation step would reintroduce an unverifiable
judgement into the one path we want mechanical. If LLM ranking is ever wanted it belongs in the
*queue*, where a human is the backstop.

## Consequences
- The uniformly-manual stance is narrowed, not dropped: a link is auto-applied only when the match
  is *not actually ambiguous* (exact name, right type, owns the cswiki article, no rival, and a
  second independent service agrees). In that case the assertion is about as verifiable as
  `Entity.key`'s own deterministic slug and strictly more grounded — it is anchored to a cswiki
  article a reader can open. Everything genuinely ambiguous still gets a human.
- A new external dependency on the WMCloud reconciliation service, but only as a *gate* on
  auto-linking — its being down degrades to "more entities in the queue", never to a wrong link or
  a blocked pipeline. Self-hostable if volume ever justifies it (research §3.4).
- `TYPE_P31_QIDS` is a hand-maintained approximation of "the right kind of thing" per entity type.
  A missed exotic subtype routes an entity to the queue (safe direction), never to a wrong
  auto-link. Tune against the real corpus.
- Auto-links are attributed to `system:auto-wikidata` in `AdminActionLog`, so the audit trail
  always distinguishes an unattended link from a human-confirmed one. An Admin unlinking a wrong
  auto-link works exactly as today (`entity.wikidata_unlinked`).
- `docs/spec-entity-resolution.md` User Story 11 and its Out-of-Scope "any automated/unconfirmed
  Wikidata link" bullet are amended in place to describe this exception; alias merges are
  untouched.
- The LLM-on-the-auto-path door stays closed by decision — a future proposal starts from this
  ADR's reasoning.
