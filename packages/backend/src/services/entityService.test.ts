import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as entityRepo from '../repositories/entity.js'
import * as entityAliasRepo from '../repositories/entityAlias.js'
import * as entityImageRepo from '../repositories/entityImage.js'
import { searchEntities, getEntityDetail } from './entityService.js'
import { NotFoundError, ValidationError } from '../errors.js'

vi.mock('../repositories/entity.js')
vi.mock('../repositories/entityAlias.js')
vi.mock('../repositories/entityImage.js')

const ENTITY = {
  id: 'e-1',
  key: 'person:petr-fiala',
  canonicalName: 'Petr Fiala',
  type: 'PERSON' as const,
  storyCount: 4,
  wikidataId: 'Q108371',
  wikidataDescription: null,
  wikipediaExtract: null,
  wikipediaUrl: null,
}

const EMPTY_STATS = { eventCount: 0, firstMentionAt: null, lastMentionAt: null, relationCount: 0 }

/** The reads getEntityDetail fans out that these tests don't each assert on — defaulted so a test
 *  only overrides what it cares about. */
function stubEntityDetailReads() {
  vi.mocked(entityImageRepo.findEntityWikiImage).mockResolvedValue(null)
  vi.mocked(entityRepo.findEntityStats).mockResolvedValue(EMPTY_STATS)
  vi.mocked(entityRepo.findCoMentionedEntities).mockResolvedValue([])
  vi.mocked(entityRepo.findMentionTimeline).mockResolvedValue([])
}

describe('searchEntities', () => {
  beforeEach(() => vi.resetAllMocks())

  it('maps repository rows to search result items', async () => {
    vi.mocked(entityRepo.searchEntitiesByName).mockResolvedValue([
      {
        key: 'person:petr-fiala',
        canonicalName: 'Petr Fiala',
        type: 'PERSON',
        storyCount: 4,
        wikidataId: 'Q108371',
      },
    ])

    await expect(searchEntities('Fiala')).resolves.toEqual([
      {
        key: 'person:petr-fiala',
        canonicalName: 'Petr Fiala',
        type: 'PERSON',
        storyCount: 4,
        wikidataId: 'Q108371',
      },
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
    expect(entityAliasRepo.findAliasesForEntity).not.toHaveBeenCalled()
  })

  it('assembles entity fields, external context, stats, co-mentions, timeline, events, relations, aliases', async () => {
    stubEntityDetailReads()
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue({
      ...ENTITY,
      wikidataDescription: 'český politik',
      wikipediaExtract: 'Petr Fiala je český politik…',
      wikipediaUrl: 'https://cs.wikipedia.org/wiki/Petr_Fiala',
    })
    vi.mocked(entityImageRepo.findEntityWikiImage).mockResolvedValue({
      imageUrl: 'https://img/fiala.jpg',
      author: 'Jane Doe',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Fiala.jpg',
    })
    vi.mocked(entityRepo.findEntityStats).mockResolvedValue({
      eventCount: 3,
      firstMentionAt: new Date('2026-06-01T00:00:00Z'),
      lastMentionAt: new Date('2026-08-01T00:00:00Z'),
      relationCount: 5,
    })
    vi.mocked(entityRepo.findCoMentionedEntities).mockResolvedValue([
      { key: 'country:czechia', canonicalName: 'Czechia', type: 'COUNTRY', sharedStoryCount: 2 },
    ])
    vi.mocked(entityRepo.findMentionTimeline).mockResolvedValue([
      { month: '2026-06', count: 1 },
      { month: '2026-08', count: 2 },
    ])
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
    vi.mocked(entityAliasRepo.findAliasesForEntity).mockResolvedValue([{ canonicalName: 'P. Fiala' }])

    const detail = await getEntityDetail('person:petr-fiala', undefined, 20)

    expect(entityRepo.findCoMentionedEntities).toHaveBeenCalledWith('person:petr-fiala', 12)
    expect(detail).toEqual({
      key: 'person:petr-fiala',
      canonicalName: 'Petr Fiala',
      type: 'PERSON',
      wikidataId: 'Q108371',
      wikidataDescription: 'český politik',
      wikipediaExtract: 'Petr Fiala je český politik…',
      wikipediaUrl: 'https://cs.wikipedia.org/wiki/Petr_Fiala',
      image: {
        url: 'https://img/fiala.jpg',
        author: 'Jane Doe',
        license: 'CC BY-SA 4.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Fiala.jpg',
      },
      aliases: ['P. Fiala'],
      eventCount: 3,
      firstMentionAt: '2026-06-01T00:00:00.000Z',
      lastMentionAt: '2026-08-01T00:00:00.000Z',
      relationCount: 5,
      coMentions: [
        { key: 'country:czechia', canonicalName: 'Czechia', type: 'COUNTRY', sharedStoryCount: 2 },
      ],
      mentionTimeline: [
        { month: '2026-06', count: 1 },
        { month: '2026-08', count: 2 },
      ],
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

  it('degrades gracefully — unlinked entity, no image/context/stats/co-mentions/timeline', async () => {
    stubEntityDetailReads()
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue({ ...ENTITY, wikidataId: null })
    vi.mocked(entityRepo.findEventsForEntity).mockResolvedValue([])
    vi.mocked(entityRepo.findRelationsForEntity).mockResolvedValue([])
    vi.mocked(entityAliasRepo.findAliasesForEntity).mockResolvedValue([])

    const detail = await getEntityDetail('person:petr-fiala', undefined, 20)

    expect(detail).toMatchObject({
      wikidataId: null,
      wikidataDescription: null,
      wikipediaExtract: null,
      image: null,
      relations: [],
      aliases: [],
      eventCount: 0,
      firstMentionAt: null,
      lastMentionAt: null,
      relationCount: 0,
      coMentions: [],
      mentionTimeline: [],
      events: { items: [], nextCursor: null },
    })
  })
})
