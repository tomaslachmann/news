import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as llmClientModule from './llmClient.js'
import { runEntityExtractionPass, extractAndPersistStoryEntities } from './entityExtractionPass.js'
import { ExternalServiceError } from '../errors.js'

vi.mock('./llmClient.js')

describe('runEntityExtractionPass', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns empty entities/entityRelations without calling the model when there are no source texts', async () => {
    const result = await runEntityExtractionPass([])

    expect(result).toEqual({ entities: [], entityRelations: [] })
    expect(llmClientModule.callJsonModel).not.toHaveBeenCalled()
  })

  it('calls callJsonModel with the source texts tagged with the entityExtraction callSite, and derives deterministic keys', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({
      entities: [
        { mention: 'Tusk', canonical_name: 'Donald Tusk', type: 'PERSON', confidence: 0.98 },
        { mention: 'Poland', canonical_name: 'Poland', type: 'COUNTRY', confidence: 0.99 },
      ],
      entityRelations: [{ from: 'Donald Tusk', to: 'Poland', type: 'REPRESENTS', confidence: 0.91 }],
    })

    const result = await runEntityExtractionPass(['Polish PM Donald Tusk said Poland would...'])

    const [model, systemPrompt, userContent, callSite] = vi.mocked(llmClientModule.callJsonModel).mock
      .calls[0]
    expect(typeof model).toBe('string')
    expect(typeof systemPrompt).toBe('string')
    expect(callSite).toBe('entityExtraction')
    expect(JSON.parse(userContent)).toEqual(['Polish PM Donald Tusk said Poland would...'])

    expect(result.entities).toEqual([
      { key: 'person:donald-tusk', name: 'Donald Tusk', type: 'PERSON', confidence: 0.98 },
      { key: 'country:poland', name: 'Poland', type: 'COUNTRY', confidence: 0.99 },
    ])
    expect(result.entityRelations).toEqual([
      { from: 'person:donald-tusk', to: 'country:poland', type: 'REPRESENTS', confidence: 0.91 },
    ])
  })

  it('drops an entityRelation whose from/to does not match any extracted entity, rather than trusting a hallucinated reference', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({
      entities: [{ mention: 'Poland', canonical_name: 'Poland', type: 'COUNTRY', confidence: 0.99 }],
      entityRelations: [{ from: 'Poland', to: 'Nonexistent Person', type: 'INVOLVES', confidence: 0.5 }],
    })

    const result = await runEntityExtractionPass(['Poland...'])

    expect(result.entityRelations).toEqual([])
  })

  it('deduplicates repeated mentions of the same entity into a single row', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({
      entities: [
        { mention: 'Tusk', canonical_name: 'Donald Tusk', type: 'PERSON', confidence: 0.9 },
        { mention: 'Donald Tusk', canonical_name: 'Donald Tusk', type: 'PERSON', confidence: 0.95 },
      ],
      entityRelations: [],
    })

    const result = await runEntityExtractionPass(['x'])

    expect(result.entities).toHaveLength(1)
    expect(result.entities[0]).toEqual({
      key: 'person:donald-tusk',
      name: 'Donald Tusk',
      type: 'PERSON',
      confidence: 0.9,
    })
  })

  it('drops a relation whose from/to name is ambiguous between two distinct entities of different types, rather than resolving it to the wrong one', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({
      entities: [
        { mention: 'Washington', canonical_name: 'Washington', type: 'PLACE', confidence: 0.9 },
        { mention: 'Washington', canonical_name: 'Washington', type: 'PERSON', confidence: 0.9 },
      ],
      entityRelations: [{ from: 'Washington', to: 'Washington', type: 'LOCATED_IN', confidence: 0.5 }],
    })

    const result = await runEntityExtractionPass(['x'])

    expect(result.entities).toHaveLength(2)
    expect(result.entityRelations).toEqual([])
  })

  it('drops a self-relation (from and to resolving to the same entity) rather than persisting one that violates the DB CHECK constraint', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({
      entities: [{ mention: 'Poland', canonical_name: 'Poland', type: 'COUNTRY', confidence: 0.9 }],
      entityRelations: [{ from: 'Poland', to: 'Poland', type: 'ANNOUNCES', confidence: 0.5 }],
    })

    const result = await runEntityExtractionPass(['x'])

    expect(result.entities).toHaveLength(1)
    expect(result.entityRelations).toEqual([])
  })

  it('propagates a thrown error rather than swallowing it', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockRejectedValue(new Error('API down'))

    await expect(runEntityExtractionPass(['x'])).rejects.toThrow('API down')
  })

  it('throws when the response does not match the expected schema', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({
      entities: [{ mention: 'x', canonical_name: 'x', type: 'NOT_A_REAL_TYPE', confidence: 0.5 }],
      entityRelations: [],
    })

    await expect(runEntityExtractionPass(['x'])).rejects.toThrow()
  })
})

describe('extractAndPersistStoryEntities', () => {
  beforeEach(() => vi.resetAllMocks())

  it('persists extraction results via the injected replaceStoryEntities function, and returns what was persisted', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({
      entities: [{ mention: 'Poland', canonical_name: 'Poland', type: 'COUNTRY', confidence: 0.99 }],
      entityRelations: [],
    })
    const replaceStoryEntities = vi.fn().mockResolvedValue(undefined)

    const result = await extractAndPersistStoryEntities('story-1', ['x'], replaceStoryEntities)

    expect(replaceStoryEntities).toHaveBeenCalledWith(
      'story-1',
      [{ key: 'country:poland', name: 'Poland', type: 'COUNTRY', confidence: 0.99 }],
      []
    )
    expect(result).toEqual({
      entities: [{ key: 'country:poland', name: 'Poland', type: 'COUNTRY', confidence: 0.99 }],
      entityRelations: [],
    })
  })

  it('does not call replaceStoryEntities and returns null when nothing was extracted, so a previous good result is never clobbered by an empty one', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({ entities: [], entityRelations: [] })
    const replaceStoryEntities = vi.fn().mockResolvedValue(undefined)

    const result = await extractAndPersistStoryEntities('story-1', ['x'], replaceStoryEntities)

    expect(replaceStoryEntities).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('rethrows as ExternalServiceError, without calling replaceStoryEntities, when the LLM call fails', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockRejectedValue(new Error('API down'))
    const replaceStoryEntities = vi.fn().mockResolvedValue(undefined)

    await expect(extractAndPersistStoryEntities('story-1', ['x'], replaceStoryEntities)).rejects.toThrow(
      ExternalServiceError
    )

    expect(replaceStoryEntities).not.toHaveBeenCalled()
  })

  it('rethrows as ExternalServiceError when replaceStoryEntities itself fails', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({
      entities: [{ mention: 'Poland', canonical_name: 'Poland', type: 'COUNTRY', confidence: 0.99 }],
      entityRelations: [],
    })
    const replaceStoryEntities = vi.fn().mockRejectedValue(new Error('DB down'))

    await expect(extractAndPersistStoryEntities('story-1', ['x'], replaceStoryEntities)).rejects.toThrow(
      ExternalServiceError
    )
  })
})
