import { describe, it, expect } from 'vitest'
import { parseStoredEntities, parseStoredEntityRelations } from './entityTypes.js'

describe('parseStoredEntities', () => {
  it('returns the parsed array when it matches the schema', () => {
    const valid = [{ key: 'country:poland', name: 'Poland', type: 'COUNTRY', confidence: 0.9 }]

    expect(parseStoredEntities(valid)).toEqual(valid)
  })

  it('returns an empty array for malformed or pre-migration data, rather than throwing', () => {
    expect(parseStoredEntities(null)).toEqual([])
    expect(parseStoredEntities(undefined)).toEqual([])
    expect(parseStoredEntities([{ key: 'x' }])).toEqual([])
    expect(parseStoredEntities('not an array')).toEqual([])
  })
})

describe('parseStoredEntityRelations', () => {
  it('returns the parsed array when it matches the schema', () => {
    const valid = [{ from: 'a', to: 'b', type: 'MEETS', confidence: 0.5 }]

    expect(parseStoredEntityRelations(valid)).toEqual(valid)
  })

  it('returns an empty array for malformed data, rather than throwing', () => {
    expect(parseStoredEntityRelations([{ from: 'a', to: 'b', type: 'NOT_REAL', confidence: 0.5 }])).toEqual(
      []
    )
  })
})
