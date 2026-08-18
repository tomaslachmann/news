import { z } from 'zod'

// Pure entity domain types/schemas — deliberately kept out of entityExtractionPass.ts (which
// also holds the LLM-calling pass) so that mocking that module's LLM call in a test (`vi.mock`
// replaces every export with an unconfigured stub) can never silently break these for other,
// unrelated callers like storyRelationScoring.ts's toRelationCandidateStory.

export const EntityTypeSchema = z.enum(['PERSON', 'ORGANIZATION', 'PLACE', 'COUNTRY'])

export const EntityRelationTypeSchema = z.enum([
  'REPRESENTS',
  'HOLDS_POSITION_IN',
  'WORKS_FOR',
  'MEMBER_OF',
  'LOCATED_IN',
  'BASED_IN',
  'PART_OF',
  'INVOLVES',
  'MEETS',
  'ATTACKS',
  'ACCUSES',
  'ANNOUNCES',
])

export interface ExtractedEntity {
  key: string
  name: string
  type: z.infer<typeof EntityTypeSchema>
  confidence: number
}

export interface ExtractedEntityRelation {
  from: string
  to: string
  type: z.infer<typeof EntityRelationTypeSchema>
  confidence: number
}

// Schemas for the *stored* shape (Story.entities/entityRelations, as persisted by
// updateStoryEntities). Used to safely read this JSON back — the same defensive-parse
// convention as Coverage.extractionResult elsewhere in this pipeline: malformed/pre-migration
// data degrades to an empty array, never thrown.
export const ExtractedEntitySchema = z.object({
  key: z.string(),
  name: z.string(),
  type: EntityTypeSchema,
  confidence: z.number().min(0).max(1),
})

export const ExtractedEntityRelationSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: EntityRelationTypeSchema,
  confidence: z.number().min(0).max(1),
})

export function parseStoredEntities(raw: unknown): ExtractedEntity[] {
  const parsed = z.array(ExtractedEntitySchema).safeParse(raw)
  return parsed.success ? parsed.data : []
}

export function parseStoredEntityRelations(raw: unknown): ExtractedEntityRelation[] {
  const parsed = z.array(ExtractedEntityRelationSchema).safeParse(raw)
  return parsed.success ? parsed.data : []
}
