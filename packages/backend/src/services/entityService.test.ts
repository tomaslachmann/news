import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as entityRepo from '../repositories/entity.js'
import { searchEntities, getEntityDetail } from './entityService.js'
import { NotFoundError, ValidationError } from '../errors.js'

vi.mock('../repositories/entity.js')

const ENTITY = {
  id: 'e-1',
  key: 'person:petr-fiala',
  canonicalName: 'Petr Fiala',
  type: 'PERSON' as const,
  storyCount: 4,
  wikidataId: 'Q108371',
}

describe('searchEntities', () => {
  beforeEach(() => vi.resetAllMocks())

  it('maps repository rows to search result items', async () => {
    vi.mocked(entityRepo.searchEntitiesByName).mockResolvedValue([
      { key: 'person:petr-fiala', canonicalName: 'Petr Fiala', type: 'PERSON', storyCount: 4 },
    ])

    await expect(searchEntities('Fiala')).resolves.toEqual([
      { key: 'person:petr-fiala', canonicalName: 'Petr Fiala', type: 'PERSON', storyCount: 4 },
    ])
    expect(entityRepo.searchEntitiesByName).toHaveBeenCalledWith('Fiala', 20)
  })

  it('throws ValidationError for a blank query without querying the repository', async () => {
    await expect(searchEntities('   ')).rejects.toThrow(ValidationError)
    expect(entityRepo.searchEntitiesByName).not.toHaveBeenCalled()
  })
})

describe('getEntityDetail', () => {
  beforeEach(() => vi.resetAllMocks())

  it('throws NotFoundError for an unknown entity key', async () => {
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue(null)

    await expect(getEntityDetail('person:nobody', undefined, 20)).rejects.toThrow(NotFoundError)
    expect(entityRepo.findEventsForEntity).not.toHaveBeenCalled()
    expect(entityRepo.findRelationsForEntity).not.toHaveBeenCalled()
  })

  it('assembles entity fields, paginated events, and attributed relations', async () => {
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue(ENTITY)
    vi.mocked(entityRepo.findEventsForEntity).mockResolvedValue([
      {
        id: 'a-1',
        createdAt: new Date('2026-08-01T00:00:00Z'),
        seedHeadline: 'Seed 1',
        headline: 'Headline 1',
      },
    ])
    vi.mocked(entityRepo.findRelationsForEntity).mockResolvedValue([
      {
        id: 'rel-1',
        type: 'REPRESENTS',
        fromEntity: { key: 'person:petr-fiala', canonicalName: 'Petr Fiala', type: 'PERSON' },
        toEntity: { key: 'country:czechia', canonicalName: 'Czechia', type: 'COUNTRY' },
        analysisId: 'a-2',
        seedHeadline: 'Seed 2',
        headline: null,
      },
    ])

    const detail = await getEntityDetail('person:petr-fiala', undefined, 20)

    expect(detail).toEqual({
      key: 'person:petr-fiala',
      canonicalName: 'Petr Fiala',
      type: 'PERSON',
      wikidataId: 'Q108371',
      events: {
        items: [{ analysisId: 'a-1', title: 'Headline 1', createdAt: '2026-08-01T00:00:00.000Z' }],
        nextCursor: null,
      },
      relations: [
        {
          id: 'rel-1',
          type: 'REPRESENTS',
          direction: 'from',
          otherEntity: { key: 'country:czechia', canonicalName: 'Czechia', type: 'COUNTRY' },
          assertedBy: { analysisId: 'a-2', title: 'Seed 2' },
        },
      ],
    })
  })

  it('degrades gracefully to a null wikidataId and an empty relations list when neither exists', async () => {
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue({ ...ENTITY, wikidataId: null })
    vi.mocked(entityRepo.findEventsForEntity).mockResolvedValue([])
    vi.mocked(entityRepo.findRelationsForEntity).mockResolvedValue([])

    const detail = await getEntityDetail('person:petr-fiala', undefined, 20)

    expect(detail.wikidataId).toBeNull()
    expect(detail.relations).toEqual([])
    expect(detail.events).toEqual({ items: [], nextCursor: null })
  })
})
