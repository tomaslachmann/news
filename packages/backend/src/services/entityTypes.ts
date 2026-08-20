import { z } from 'zod'

// Pure entity domain types/schemas — deliberately kept out of entityExtractionPass.ts (which
// also holds the LLM-calling pass) so that mocking that module's LLM call in a test (`vi.mock`
// replaces every export with an unconfigured stub) can never silently break these for other,
// unrelated callers like repositories/entity.ts.

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
  /** Fraction of this Story's source-text fragments that mention this entity, 0 to 1 (ticket 12).
   *  A structural "how central is this entity to this Story's coverage" signal, distinct from
   *  `confidence` (how sure the model is about the extraction itself). */
  salience: number
}

export interface ExtractedEntityRelation {
  from: string
  to: string
  type: z.infer<typeof EntityRelationTypeSchema>
  confidence: number
}
