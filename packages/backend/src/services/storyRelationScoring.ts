import { cosineSimilarity } from './storyMatching.js'
import type { RawRelationCandidateStory } from '../repositories/storyRelation.js'
import type { EntityForScoring, EntityRelationForScoring } from '../repositories/entity.js'

// How far back a Story stays eligible as a relation candidate — deliberately much wider than
// DEDUP_WINDOW_HOURS (48h, storyMatching.ts): that window exists to catch duplicates of the
// SAME event, this one needs to catch a genuinely later development of a DIFFERENT event (a
// reaction days later). Own constant, not a reuse — see ticket 35.
export const RELATION_CANDIDATE_WINDOW_HOURS = 24 * 14

/** Linear decay to zero at the edge of the window — not storyMatching.ts's exponential
 *  half-life, which is tuned for an hours-scale window and wouldn't transfer meaningfully to one
 *  measured in weeks. Clamped at zero rather than going negative for anything beyond it. */
function timeProximity(ageHours: number): number {
  return Math.max(0, 1 - ageHours / RELATION_CANDIDATE_WINDOW_HOURS)
}

/** ln((totalStories+1)/(storyCount+1)) — an entity attached to nearly every Story (e.g. "Czech
 *  Republic", "government") weights close to zero; one attached to only a handful weights high.
 *  ADR 0024 (fixes P1-9): this is only possible now that Entity.storyCount is a materialized,
 *  queryable frequency, which the JSON column this replaced could never expose. */
function idfWeight(storyCount: number, totalStories: number): number {
  return Math.log((totalStories + 1) / (storyCount + 1))
}

/** IDF-weighted containment — Σ w(A∩B) / min(Σw(A), Σw(B)) — replacing plain Jaccard for entity
 *  overlap (docs/audit.md P1-9): Jaccard penalizes exactly the size asymmetry this project's two
 *  extraction paths produce (Ingestion: 2-5 entities from headlines alone; human-seeded: 30-50
 *  from full Coverage text) — 3 entities fully contained in 40 score 0.075 under Jaccard, despite
 *  perfect containment, and stays lost under the 0.35 threshold. Containment doesn't have that
 *  problem, and the IDF weighting on top keeps a handful of near-universal entities from
 *  dominating the signal the way an unweighted overlap measure would. */
function weightedEntityContainment(
  a: EntityForScoring[],
  b: EntityForScoring[],
  totalStories: number
): number {
  if (a.length === 0 || b.length === 0) return 0
  const bKeys = new Set(b.map((e) => e.key))
  let intersectionWeight = 0
  let aWeight = 0
  for (const e of a) {
    const w = idfWeight(e.storyCount, totalStories)
    aWeight += w
    if (bKeys.has(e.key)) intersectionWeight += w
  }
  let bWeight = 0
  for (const e of b) bWeight += idfWeight(e.storyCount, totalStories)
  const denom = Math.min(aWeight, bWeight)
  return denom === 0 ? 0 : intersectionWeight / denom
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const item of a) if (b.has(item)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

function entityRelationTripleSet(relations: EntityRelationForScoring[]): Set<string> {
  return new Set(relations.map((r) => `${r.fromKey}|${r.type}|${r.toKey}`))
}

// Repository rows already carry entities/entityRelations in exactly the shape scoring needs
// (`{key, storyCount}[]` / `{fromKey, toKey, type}[]`) — Prisma guarantees the shape, so unlike
// the JSON column this replaced, there is no defensive-parse step between "read from the DB" and
// "score." RelationCandidateStory is the same shape under a name scoped to this module.
export type RelationCandidateStory = RawRelationCandidateStory

export interface RelationCandidateInput {
  embedding: number[]
  entities: EntityForScoring[]
  entityRelations: EntityRelationForScoring[]
}

// Weights are a starting point, not a tuned result — same convention as MATCH_THRESHOLD and
// storyMatching.ts's decay constants (see its own header comment); expect to revisit once real
// relation data exists to calibrate against.
const EMBEDDING_WEIGHT = 0.5
const ENTITY_OVERLAP_WEIGHT = 0.2
const ENTITY_RELATION_OVERLAP_WEIGHT = 0.15
const TIME_PROXIMITY_WEIGHT = 0.15

export const RELATION_CANDIDATE_SCORE_THRESHOLD = 0.35
export const RELATION_CANDIDATE_POOL_SIZE = 20

/**
 * Ranks `candidates` against `current` by a cheap, LLM-free combination of embedding similarity,
 * IDF-weighted entity-key containment, entity-relation overlap, and time proximity — the
 * shortlist an LLM confirmation call is only ever run against (ticket 35), never the full
 * candidate pool. `totalStories` is the corpus size the IDF weighting needs (ADR 0024) —
 * repositories/entity.ts's countStories().
 *
 * Returns at most RELATION_CANDIDATE_POOL_SIZE candidates scoring at or above
 * RELATION_CANDIDATE_SCORE_THRESHOLD, highest score first. Does not itself bound candidates by
 * age — the caller's candidate-pool query already does that via RELATION_CANDIDATE_WINDOW_HOURS;
 * this function only uses age as one of several scoring signals.
 */
export function scoreRelationCandidates(
  current: RelationCandidateInput,
  candidates: RelationCandidateStory[],
  totalStories: number,
  now: Date
): RelationCandidateStory[] {
  const currentRelationTriples = entityRelationTripleSet(current.entityRelations)

  const scored = candidates.map((candidateStory) => {
    const embeddingSimilarity = cosineSimilarity(current.embedding, candidateStory.embedding)
    const entityOverlap = weightedEntityContainment(current.entities, candidateStory.entities, totalStories)
    const entityRelationOverlap = jaccard(
      currentRelationTriples,
      entityRelationTripleSet(candidateStory.entityRelations)
    )
    const ageHours = (now.getTime() - candidateStory.createdAt.getTime()) / (60 * 60 * 1000)

    const score =
      EMBEDDING_WEIGHT * embeddingSimilarity +
      ENTITY_OVERLAP_WEIGHT * entityOverlap +
      ENTITY_RELATION_OVERLAP_WEIGHT * entityRelationOverlap +
      TIME_PROXIMITY_WEIGHT * timeProximity(ageHours)

    return { candidateStory, score }
  })

  return scored
    .filter((s) => s.score >= RELATION_CANDIDATE_SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, RELATION_CANDIDATE_POOL_SIZE)
    .map((s) => s.candidateStory)
}
