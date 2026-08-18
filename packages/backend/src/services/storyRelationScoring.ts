import { cosineSimilarity } from './storyMatching.js'
import {
  parseStoredEntities,
  parseStoredEntityRelations,
  type ExtractedEntity,
  type ExtractedEntityRelation,
} from './entityTypes.js'
import type { RawRelationCandidateStory } from '../repositories/storyRelation.js'

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

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const item of a) if (b.has(item)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

function entityKeySet(entities: ExtractedEntity[]): Set<string> {
  return new Set(entities.map((e) => e.key))
}

function entityRelationTripleSet(relations: ExtractedEntityRelation[]): Set<string> {
  return new Set(relations.map((r) => `${r.from}|${r.type}|${r.to}`))
}

export interface RelationCandidateStory {
  storyId: string
  analysisId: string
  anchorHeadline: string
  embedding: number[]
  entities: ExtractedEntity[]
  entityRelations: ExtractedEntityRelation[]
  createdAt: Date
}

export interface RelationCandidateInput {
  embedding: number[]
  entities: ExtractedEntity[]
  entityRelations: ExtractedEntityRelation[]
}

/** Converts a repository row's raw entities/entityRelations JSON into the parsed, typed shape
 *  scoreRelationCandidates needs — the one place this defensive parse happens, kept out of
 *  repositories/storyRelation.ts so that file has no service-layer import (repositories only
 *  talk to Prisma, per ADR 0010's spirit). Malformed/pre-migration JSON degrades to an empty
 *  array via parseStoredEntities/parseStoredEntityRelations, never thrown. */
export function toRelationCandidateStory(raw: RawRelationCandidateStory): RelationCandidateStory {
  return {
    storyId: raw.storyId,
    analysisId: raw.analysisId,
    anchorHeadline: raw.anchorHeadline,
    embedding: raw.embedding,
    entities: parseStoredEntities(raw.entities),
    entityRelations: parseStoredEntityRelations(raw.entityRelations),
    createdAt: raw.createdAt,
  }
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
 * entity-key overlap, entity-relation overlap, and time proximity — the shortlist an LLM
 * confirmation call is only ever run against (ticket 35), never the full candidate pool.
 *
 * Returns at most RELATION_CANDIDATE_POOL_SIZE candidates scoring at or above
 * RELATION_CANDIDATE_SCORE_THRESHOLD, highest score first. Does not itself bound candidates by
 * age — the caller's candidate-pool query already does that via RELATION_CANDIDATE_WINDOW_HOURS;
 * this function only uses age as one of several scoring signals.
 */
export function scoreRelationCandidates(
  current: RelationCandidateInput,
  candidates: RelationCandidateStory[],
  now: Date
): RelationCandidateStory[] {
  const currentEntityKeys = entityKeySet(current.entities)
  const currentRelationTriples = entityRelationTripleSet(current.entityRelations)

  const scored = candidates.map((candidateStory) => {
    const embeddingSimilarity = cosineSimilarity(current.embedding, candidateStory.embedding)
    const entityOverlap = jaccard(currentEntityKeys, entityKeySet(candidateStory.entities))
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
