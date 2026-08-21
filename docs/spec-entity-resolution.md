# Spec — Entity Resolution: Aliases and Wikidata Linking

**Triage label:** ready-for-agent

## Problem Statement

`Entity.key` (`type:slugify(canonical_name)`, ADR 0022/0024) is a deterministic *label*, not a verified real-world identity — an accepted v1 limitation, documented at the time as something "a future entity-resolution/aliasing layer could disambiguate... without changing today's data shape" (`docs/spec-event-graph.md`, Out of Scope). Two gaps follow directly from that limitation, both currently real:

1. **Name-variant fragmentation**: the same real-world entity mentioned with a different normalized form across two extraction calls (e.g. "USA" vs. "United States", "ČT24" vs. "Česká televize") produces two distinct `Entity` rows with two distinct `key`s. `storyCount`, IDF weighting, and any future "all Stories about entity X" query all silently undercount, split across rows that should be one.
2. **No external grounding**: an `Entity` is only ever what this system's own extraction has seen — there's no way to link "Donald Tusk" (this system's row) to the actual person, disambiguate a genuinely ambiguous name (place vs. person both named "Washington"), or pull in outside context (a photo, a one-line description, a canonical spelling) for a future entity-facing page.

This ticket exists to close both gaps — deliberately scoped to identity/resolution only. Presenting that resolved identity to a reader (an entity page, a browse/search UI, salience-weighted relevance) is `docs/spec-entity-wiki.md`'s concern, not this one's.

## Solution

Two additive mechanisms, both **admin-confirmed, never auto-applied silently** — consistent with ADR 0012's "never assert beyond what's verifiable" principle, which this project has applied consistently everywhere else a cheap heuristic could be wrong (Draft review, `StoryRelation`'s LOW-confidence queue):

- **`EntityAlias`**: a name variant known to refer to the same real-world entity as some canonical `Entity` row. Candidates are suggested cheaply (the `pg_trgm` fuzzy index `docs/adr/0032`... — actually ticket 12's `entity_canonicalName_trgm_idx` — surfaces likely-same-entity pairs by name similarity), an Admin reviews and confirms or rejects each suggested merge, and a confirmed alias makes the two names resolve to one `Entity` going forward (existing `StoryEntity`/`StoryEntityRelation` rows referencing the merged-away `Entity` are repointed to the surviving one).
- **`Entity.wikidataId`**: an optional link from an `Entity` to its corresponding Wikidata item (`Q...` id). Populated by an Admin action (search Wikidata by canonical name, confirm the correct match, save the id) — not an automated background linker in this wave; Wikidata's own disambiguation problem (many entities share names) makes an unconfirmed automatic match exactly the kind of unverifiable assertion ADR 0012 exists to prevent.
- **`EntityImage`**: an image for the Entity, sourced from its linked Wikidata item (Wikimedia only, v1) and fetched **automatically**, not via a second Admin-confirmed action. This is enrichment of an identity the Admin already vouched for by confirming the `wikidataId` link, not a new identity claim of its own — so it doesn't need the same manual-confirmation posture as the link itself (ADR 0034).

## User Stories

1. As a Maintainer, I want two `Entity` rows that turn out to be the same real-world entity mergeable into one, so `storyCount`/IDF weighting and any future entity-scoped query stop silently splitting across fragmented rows.
2. As an Admin, I want to be shown candidate same-entity pairs ranked by name similarity, so I don't have to manually search for fragmentation across a growing entity list.
3. As an Admin, I want to confirm or reject each suggested merge individually, so a wrong suggestion (two different real-world entities that happen to have similar names) never gets merged automatically.
4. As an Admin, I want a rejected merge suggestion recorded as rejected, not silently discarded, so the same pair doesn't get re-suggested on a later pass — mirroring `StoryRelation`'s reject semantics.
5. As a Maintainer, I want a confirmed merge to repoint every existing `StoryEntity`/`StoryEntityRelation` row from the merged-away `Entity` to the surviving one, so no historical data is lost or orphaned by the merge.
6. As a Maintainer, I want the merged-away `Entity`'s own row (and its `key`) retained as a documented alias of the survivor, not deleted outright, so a future extraction pass that produces the old key again resolves to the same surviving entity instead of recreating the fragment.
7. As an Admin, I want to search Wikidata by an Entity's canonical name and see candidate matches (name, description, a disambiguating snippet), so I can pick the correct item without leaving the admin tool.
8. As an Admin, I want to confirm a specific Wikidata match for an Entity, storing its `Q...` id, so the link is a human-verified fact, not a guessed one.
9. As an Admin, I want to remove or change a previously-confirmed Wikidata link, so a mistaken match is correctable.
10. As a Maintainer, I want `wikidataId` to remain nullable with no default value and no backfill for existing Entities, so this is purely additive — matching this project's established no-backfill convention (ADR 0021, ticket 16's `Story.eventTime`).
11. As a Maintainer, I want it explicit that neither an alias merge nor a Wikidata link is ever inferred and auto-applied without an Admin's confirmation, so this feature never silently asserts a real-world-identity claim the extraction pipeline itself is documented as not making (ADR 0022).
12. As a Maintainer, I want this entire feature reachable only via Prisma-Studio-adjacent or dedicated Admin UI, never by a reader, so the trust boundary matches every other maintainer-only surface in this codebase (`LlmCallLog`, `MatchDecision`, `AdminActionLog`).
13. As an Admin, I want an Entity's image to appear automatically once I link its `wikidataId`, with no separate action, so enrichment doesn't add manual work on top of the identity confirmation I already made.
14. As a Maintainer, I want image enrichment to run asynchronously, only after the linking transaction commits, so a slow or failing Wikimedia call can never block or risk the `wikidataId` link itself.
15. As a Maintainer, I want a missing or failed image fetch to just leave the Entity imageless — not retried indefinitely, not surfaced as an error to the Admin — so this stays best-effort enrichment, never a required step.

## Implementation Decisions

- **New Prisma model `EntityAlias`**: `id`, `entityId` (FK to the surviving `Entity`), `alias` (`String` — the merged-away entity's own `canonicalName`/`key` at merge time), `mergedFromEntityId` (the id the merged-away row had, kept for audit trail even though that row itself is not deleted — see below), `createdAt`, `confirmedBy` (actor id, mirrors `AdminActionLog`'s pattern). `@@unique([alias])` — one alias string resolves to exactly one surviving entity.
- **Merge mechanics**: the merged-away `Entity` row is **not deleted** — its `key` becomes permanently redirected via a lookup step every entity-resolution call site must perform (`resolveEntityKey(key): key` — returns the surviving key if `key` has a confirmed `EntityAlias`, else `key` unchanged) before using a key to upsert/query. This mirrors `resolveSourceByUrl`'s existing "resolve, then use canonical" pattern (`Source`/`sourceResolver.ts`) rather than inventing a new mechanism. `StoryEntity`/`StoryEntityRelation` rows already pointing at the merged-away `entityId` are updated to the surviving `entityId` in the same transaction the merge confirms in (a bounded, one-time data migration per merge — not a background job).
- **Candidate suggestion**: a new Admin-triggered (not automatic/scheduled) query using `entity_canonicalName_trgm_idx` (ticket 12) — `SELECT ... WHERE similarity(canonicalName, canonicalName) > threshold` self-joined, excluding already-aliased pairs and pairs already rejected. Threshold and pagination are implementation-time tunable constants, same convention as `MATCH_THRESHOLD`.
- **Rejected suggestions**: a new lightweight table or a `status` column tracking `REJECTED` pairs (exact shape — dedicated table vs. reusing `EntityAlias` with a `status` enum including `REJECTED` — left to ticket-breakdown time) so a rejected pair is excluded from future candidate queries, mirroring `StoryRelation.status`'s `REJECTED` permanence.
- **`Entity.wikidataId String?`**: nullable, no default. Admin search flow calls Wikidata's public search API (`wbsearchentities` or the REST equivalent) server-side (never client-side, keeping the API key/rate-limit surface, if any, server-controlled) and returns candidates for the Admin to pick from; confirming one is a plain `UPDATE Entity SET wikidataId = ...`. No caching/durable-log table for these lookups in this wave (unlike `LlmCallLog`/`EmbeddingCache` — Wikidata search is not billed, low-volume, and admin-triggered, not a hot path) — revisit only if it's ever shown to matter.
- **Both admin-confirmed features are `requireAdmin`-gated**, and both actions (`entity.alias_merged`, `entity.wikidata_linked`) get an `AdminActionLog` row each (ticket 09's established pattern), including the merge-reject action. `EntityImage` enrichment is not an Admin action itself (see below) and gets no `AdminActionLog` row of its own.
- **New Prisma model `EntityImage`**: `id`, `entityId` (FK to `Entity`, `onDelete: Cascade`), `provider` (`EntityImageProvider` enum — v1 declares only `WIKIMEDIA`), `externalId`, `imageUrl`, `thumbnailUrl` (nullable), `author`/`license`/`sourceUrl` (attribution fields Wikimedia content requires), `width`/`height` (nullable), `createdAt`. `@@unique([provider, externalId])`. No `isPrimary` field in v1 — with one provider an Entity has zero or one image, nothing to prioritize among yet; add it back only when a second provider creates a real multi-candidate situation (ADR 0034).
- **New job `entity.image.enrich`** (added to the `JobName` registry, ADR 0028), payload `{ entityId }`. Enqueued immediately after the `wikidataId`-link transaction **commits** — never from inside that transaction, so a slow/failing image fetch can't hold up or roll back the link. The handler re-reads the Entity's current `wikidataId` by `entityId` (retry-safe, same re-read-by-id pattern `entity.extract` already uses for `coverageIds`), calls a thin Wikimedia image-lookup client (one function, one external call — mirrors `articleFetchClient.ts`'s shape) and either creates one `EntityImage` row or completes with none found; either outcome is a normal, non-error completion. Retry policy: a new bounded-backoff constant (an external HTTP dependency, not an LLM call — `LLM_JOB_RETRY_POLICY`'s "persistent outage vs. content issue" framing doesn't apply the same way here).
- **New ADR expected at implementation time** for the alias/Wikidata pieces, documenting: the redirect-not-delete merge mechanic (vs. a hard rewrite of all foreign keys and dropping the row), and the deliberate no-auto-apply stance for both mechanisms. The `EntityImage`/`entity.image.enrich` design is already decided — see ADR 0034 — no further ADR needed for that piece specifically.

## Testing Decisions

Matches this codebase's established layering (ADR 0007/0010):

- `resolveEntityKey` and the merge-mechanics function: pure/repository-level, unit-tested directly with repository mocks, mirroring `entity.ts`'s existing `replaceStoryEntities` test coverage pattern.
- The trigram-similarity candidate query and the merge transaction (repointing `StoryEntity`/`StoryEntityRelation` rows): integration-tested against a real, ephemeral Postgres instance via testcontainers, mirroring `test/integration/entity.test.ts`.
- The Wikidata search call: a thin client module (mirroring `articleFetchClient.ts`'s shape — one function, one external call), unit-tested by mocking the HTTP call, never hitting the real Wikidata API in tests.
- New Admin actions (merge confirm/reject, Wikidata link confirm/remove): service-layer tests via repository mocks, mirroring `ingestionService.test.ts`'s `approveDraft`/`rejectDraft` pattern, including the `AdminActionLog` call.
- The Wikimedia image-lookup client: same convention as the Wikidata search client above — unit-tested by mocking the HTTP call, never hitting the real API.
- `entity.image.enrich`'s handler: service-layer tested via repository mocks, asserting it never throws on a not-found/failed fetch (completes with no `EntityImage` row instead) and that the enqueue call itself only ever happens after the linking transaction's commit, never inside it.

## Out of Scope

- Any automated/unconfirmed merge or Wikidata link — every match this spec produces is a suggestion an Admin must act on, never applied silently. A future "auto-merge above confidence X" mode is a distinct, much bigger trust decision, not part of this wave.
- Reader-facing exposure of aliases or Wikidata links — `docs/spec-entity-wiki.md`'s concern.
- Multi-way merges in one action (merging three or more fragmented rows at once) — this wave supports pairwise merge only; a third fragment gets its own merge action against the (by-then) surviving row.
- Un-merging a confirmed alias (splitting a wrongly-merged pair back apart) — not built in this wave; a wrong merge requires direct DB intervention until this is scoped.
- Any non-Wikidata external knowledge source (DBpedia, a custom knowledge base) — Wikidata only, per the user's stated direction.
- Wikidata data sync (keeping a linked Entity's cached name/description up to date with upstream changes) — this wave stores only the `Q...` id, no cached Wikidata fields.
- Non-Wikimedia image providers (Openverse, Unsplash) and any multi-image "primary" selection — v1 is Wikimedia-only, zero-or-one image per Entity; provider fallback and `isPrimary` are additive later, not foreclosed (ADR 0034).
- Manual/admin-triggered re-fetch or replacement of an Entity's image — this wave is fetch-once, best-effort, triggered only by the initial `wikidataId` link; a wrong or stale image needs direct DB intervention until re-fetch is scoped.

## Further Notes

Split out of a broader "entity knowledge graph" direction the user stated directly (not derived from `docs/audit.md`, whose own framing of "why entities exist" was checked against `docs/spec-event-graph.md` and found not to literally match that spec's text — see `.scratch/backend-audit/issues/12-entity-salience-and-fuzzy-search.md`'s Answer). Split from `docs/spec-entity-wiki.md` along a resolution-vs-presentation boundary: this spec makes entity identity more correct and richer; the sibling spec is what a reader/Admin actually sees. Either could ship first, but the wiki spec's entity page is materially more useful once alias merging exists (fewer fragmented near-duplicate entity pages) — implementation order is a ticket-breakdown-time call, not fixed here.

The candidate-suggestion threshold and the exact Wikidata search UX (inline in an entity's own admin view vs. a dedicated linking page) are left to implementation-time judgment, same convention as this project's other not-pinned-in-spec tunables.

`EntityImage` and the `entity.image.enrich` job were added to this spec after the fact, during the NarrativeDocument/Cross-Source Narrative grilling session that motivated an entity actually having a displayable image (a reader clicking an inline `<nt:e>` reference expects to see who/what they clicked) — see ADR 0034 and `CONTEXT.md`'s **Entity Image** entry. This spec's original alias/Wikidata-linking scope is otherwise unchanged by that session.
