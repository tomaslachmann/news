# ADR 0033 — Entity Alias Merge: redirect-not-delete, Admin-confirmed only

## Status
Accepted

## Context
`Entity.key` (`type:slugify(canonicalName)`, ADR 0022/0024) is a deterministic label, not a
verified real-world identity. Two extraction passes that mention the same real-world entity under
a different normalized form — "USA" vs. "United States", "ČT24" vs. "Česká televize" — produce two
distinct `Entity` rows with two distinct keys. `storyCount`, IDF weighting
(`storyRelationScoring.ts`), and any future "all Stories about entity X" query silently undercount,
split across rows that should be one. `docs/spec-entity-resolution.md` (ticket 40) closes this gap
with an `EntityAlias` mechanism: an Admin reviews name-similarity candidate pairs (ticket 12's
`entity_canonicalName_trgm_idx`) and confirms or rejects each one.

Two implementation calls needed a documented decision: how a confirmed merge actually redirects
existing data, and how much of this is ever automatic.

## Decision

**Redirect, never delete or hard-rewrite.** Confirming a merge does not delete the merged-away
`Entity` row and does not rewrite every foreign key that referenced it. Instead:

- A new `EntityAlias` row records `alias` (the merged-away entity's own `key`) → `entityId` (the
  surviving entity). `resolveEntityKey(key)` (`repositories/entityAlias.ts`) is a single lookup
  against this table, consulted by every entity-resolution call site
  (`repositories/entity.ts`'s `replaceStoryEntities`) before a freshly-derived key is used to
  upsert or query — a raw key with a confirmed alias resolves to its survivor; an unaliased key
  passes through unchanged.
- `StoryEntity`/`StoryEntityRelation` rows that reference the merged-away entity *are* repointed to
  the survivor, in the same transaction (`mergeEntities`) — this is real, bounded, one-time data
  migration, not deferred to read time. What's deliberately *not* rewritten is the `Entity` row
  itself: its id, its `key`, its `canonicalName` all survive unchanged, purely as a redirect
  target.

The alternative — hard-rewrite every foreign key to the surviving id and delete the merged-away
row — was rejected for two reasons specific to this codebase. First, `Entity.key` is `@unique` and
is the join key `entityExtractionPass.ts`'s dedup logic and `storyRelationScoring.ts`'s IDF lookup
both key off directly; deleting the row would mean a *third* extraction pass that reproduces the
old key (a name variant the model normalizes differently on a different day) has nothing to find
and re-creates the exact fragment the merge just fixed. Keeping the row as a live redirect target
is what makes `resolveEntityKey` a permanent fix rather than a one-time cleanup that erodes over
time. Second, deleting a row this codebase's other tables (`StoryEntity`, `StoryEntityRelation`,
and now `EntityAlias` itself) foreign-key against would need cascade or orphan handling this
project has consistently avoided elsewhere (`LlmCallLog`/`AdminActionLog`/`MatchDecision` are all
deliberately FK-free specifically so nothing here has to reason about delete order or orphaned
audit rows — ADR 0020).

**Chained merges flatten at write time, so reads stay a single lookup.** The spec's own example —
"a third fragment gets its own merge action against the (by-then) surviving row" — means a survivor
from one merge can itself later be merged into a different entity. If that happened without special
handling, `resolveEntityKey` would need to walk a chain (`A → B → C`) at read time, on every call.
Instead, `mergeEntities` flattens: when `B` is merged into `C`, any existing `EntityAlias` row whose
`entityId` was `B` is rewritten to point at `C` directly, in the same transaction. `resolveEntityKey`
never became a chain-walking function; it stayed the single `SELECT` the spec describes.
`EntityAlias.mergedFromEntityId` is `@unique` specifically to make this safe — an entity that has
already been merged away is never selected as a merge target again (the candidate query excludes
it from both sides of a future pair), so there is exactly one flattening event to handle per entity,
never a race between two competing "this entity is being merged away" writes.

**Never auto-applied.** Every `EntityAlias` row traces back to an Admin's explicit confirm action
(`entity.alias_merged` in `AdminActionLog`) on a candidate the trigram query only *suggested* — the
same posture as `StoryRelation`'s LOW-confidence review queue (ticket 36) and consistent with ADR
0012's "never assert beyond what's verifiable." A rejected candidate is recorded permanently
(`EntityAliasRejection`, mirroring `StoryRelation.status`'s REJECTED semantics) rather than silently
discarded, so it is never re-suggested. This same no-auto-apply stance is expected to carry over to
ticket 41's Wikidata linking when it lands — a Wikidata match is exactly the kind of unverifiable
assertion this principle exists to prevent from happening silently.

## Consequences
- A merged-away `Entity` row is permanent, inert storage — it is never returned by
  `findCandidatePairs` again and nothing reads its own `storyCount`/`canonicalName` as current
  after the merge (the survivor's `storyCount` is recomputed from the post-repoint `StoryEntity`
  set). It exists solely so `EntityAlias.mergedFromEntityId`'s foreign key — and any future
  extraction pass reproducing its old key — has something to resolve against.
- Un-merging a confirmed alias is not supported (`docs/spec-entity-resolution.md`'s own Out of
  Scope) — because nothing is deleted or destructively rewritten, a wrong merge is theoretically
  recoverable by hand (delete the `EntityAlias` row, re-split the repointed `StoryEntity`/
  `StoryEntityRelation` rows), but no tooling does this yet. A future un-merge ticket has real data
  to work from, not just an audit log to reconstruct from.
- `replaceStoryEntities` (`repositories/entity.ts`) is the one place resolution has to happen for
  correctness to hold, regardless of which upstream caller forgot to resolve first — it takes
  `resolveEntityKey` as an injected dependency (defaulting to the identity function, so no
  pre-ticket-40 caller or test needed to change) rather than every caller being trusted to resolve
  before it's called.
