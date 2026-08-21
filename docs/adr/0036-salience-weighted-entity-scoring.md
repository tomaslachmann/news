# ADR 0036 — Salience-weighted entity scoring formula

## Status
Accepted

## Context
`StoryEntity.salience` (ticket 12, ADR 0024) has been computed and persisted since ticket 12 — the
fraction of a Story's source-text fragments that mention a given entity — but never read by
anything. `storyRelationScoring.ts`'s `weightedEntityContainment` (ADR 0024, fixing docs/audit.md's
P1-9) has weighted every entity a Story carries purely by `idfWeight(storyCount, totalStories)`:
how rare that entity is across the whole corpus, with no notion of how central it was to *this*
Story's own coverage. `docs/spec-entity-wiki.md` (ticket 42) calls for wiring `salience` in
(Implementation Decisions, User Story 6/7), deliberately leaving the exact blend an
implementation-time tunable rather than locking it in the spec, since the project's database was
still empty of real Story data as of ticket 12's own fact-finding.

## Decision
**Bounded multiplicative adjustment on top of IDF, not a replacement for it or an additive
blend:**

```
entityWeight(e) = idfWeight(e.storyCount, totalStories) × (1 + 0.5 × clamp(e.salience, 0, 1))
```

IDF stays the primary cross-story discriminative signal — a near-universal entity (e.g. "Czech
Republic") still weighs close to zero no matter how salient it was to one Story's own coverage,
preserving the exact ranking-inversion property ADR 0024 introduced IDF weighting for (docs/
audit.md P1-9: a shared rare entity should count for more than two shared near-universal ones).
Salience can boost an entity's weight by at most 1.5×, never overwhelm rarity or let a single
salient-but-common entity dominate the containment score.

`salience = 0` (an entity attached before ticket 12's field existed, or genuinely mentioned in
only a single source fragment out of many) reduces the formula to `idfWeight(...)` exactly — this
change is behavior-preserving for every currently-persisted `StoryEntity` row and every existing
`weightedEntityContainment` test, without needing a migration or backfill.

**`weightedEntityContainment`'s own ratio is now clamped to `[0, 1]`, which pre-ticket-44 code
never needed.** `intersectionWeight` sums each shared key's weight taken from `a`'s
`EntityForScoring` copy only, not `b`'s (an existing, unchanged asymmetry in this containment
formula, not something this ticket revisits). Before salience, `entityWeight` (then `idfWeight`
alone) depended only on the shared, global `Entity.storyCount`, so the same entity key always
carried identical weight in `a` and `b` — `intersectionWeight <= min(aWeight, bWeight)` held
structurally. `StoryEntity.salience` is per-`(Story, Entity)`: the same entity can be highly
salient in `a`'s Story (up to 1.5× its `idfWeight`) while barely mentioned in `b`'s (left at
1.0×), which can push the raw ratio above 1 when `b`'s total weight is the binding denominator —
caught by code review with a concrete repro (`storyCount=3` shared entity, `salience=1` in `a`,
`salience=0` in `b`, `totalStories=100` → raw ratio ≈1.5) and fixed by clamping the final return
value, mirroring `timeProximity`'s existing `[0, 1]` clamp for the same reason: an unbounded
component would otherwise inflate `scoreRelationCandidates`'s weighted sum past what its other
three, genuinely bounded signals produce.

**`clamp(salience, 0, 1)` is defensive, not a normalization requirement.** `StoryEntity.salience`
is computed in `entityExtractionPass.ts` as `indices.size / sourceTexts.length`, where `indices` is
a `Set` of validated (`Number.isInteger`, in-range) source-fragment indices — its size can never
exceed `sourceTexts.length`, and `sourceTexts.length === 0` is guarded earlier in the same function
(returns before the division). `salience` is therefore already guaranteed within `[0, 1]` by
construction at the one call site that produces it; no rescaling like `(s - min) / (max - min)` is
needed. The `clamp` in `entityWeight` exists only because `weightedEntityContainment` has no way to
enforce that invariant on its caller's behalf — a future non-extraction-pass writer of
`StoryEntity.salience` (there is none today) could otherwise violate it silently.

**Change is isolated to `entityWeight`, used everywhere `weightedEntityContainment` previously
called `idfWeight` directly** (both the `aWeight`/`intersectionWeight` accumulation over `a` and
the `bWeight` accumulation over `b`) — `scoreRelationCandidates`'s public signature, its other three
signals (embedding similarity, entity-relation Jaccard, time proximity), and every other consumer
of `storyRelationScoring.ts` are unaffected (User Story 8).

## Alternatives rejected
- **Additive blending** (`idfWeight(e) + k × salience(e)`, or `idfWeight(e) × (1 - k) + salience(e)
  × k`): salience is a per-Story, unitless [0,1] fraction while `idfWeight` is an unbounded
  `ln(...)` quantity — adding them mixes two differently-scaled signals with no principled way to
  pick `k`, and a high-salience-but-common entity could get boosted past a rare-but-incidental one
  in a way IDF weighting was specifically introduced to prevent.
- **Unbounded multiplication** (`idfWeight(e) × salience(e)` alone, or `idfWeight(e) × (1 +
  salience(e))` with no cap on the boost factor): a `salience(e) = 0` entity would collapse to zero
  weight entirely under plain multiplication, silently dropping it from containment scoring rather
  than treating it as "IDF-only, no salience signal available" — the exact backward-compatibility
  property this decision needed for pre-ticket-44 data.
- **Replacing IDF with salience alone**: salience has no cross-corpus component at all — every
  Story's own entities have *some* salience value relative to that Story's fragments, so it cannot
  distinguish a rare, specific entity from a near-universal one the way `idfWeight` does. This
  would reintroduce exactly the problem ADR 0024 fixed.

## Consequences
- `weightedEntityContainment`'s exact numeric output for any Story with `salience > 0` on any
  entity changes from pre-ticket-44 behavior — expected, and covered by a new unit test asserting a
  high-salience entity contributes more to containment than an identical-`storyCount`,
  low-salience one.
- `0.5` is a starting constant, not a tuned result — same posture as `EMBEDDING_WEIGHT`/
  `ENTITY_OVERLAP_WEIGHT`/etc. and `MATCH_THRESHOLD` (storyRelationScoring.ts's and
  storyMatching.ts's own header comments): revisit once real Story/relation data exists to
  calibrate against, per `docs/spec-entity-wiki.md`'s own framing of this blend as an
  implementation-time tunable.
- `EntityForScoring` (repositories/entity.ts) now requires `salience: number` alongside `key`/
  `storyCount`; both of its producers (`findStoryEntitiesForScoring`, `findRelationCandidateStories`
  in repositories/storyRelation.ts) select `StoryEntity.salience` directly rather than deriving it,
  since it's a join-row field, not an `Entity` field.
