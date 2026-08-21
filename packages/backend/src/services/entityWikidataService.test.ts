import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as entityRepo from '../repositories/entity.js'
import * as adminActionLogRepo from '../repositories/adminActionLog.js'
import { enqueueJob } from '../jobs/enqueue.js'
import { JobName } from '../jobs/jobDefinitions.js'
import { searchWikidataEntities } from './wikidataSearchClient.js'
import { getWikidataCandidates, linkEntityWikidata, unlinkEntityWikidata } from './entityWikidataService.js'
import { NotFoundError, ValidationError } from '../errors.js'

vi.mock('../repositories/entity.js')
vi.mock('../repositories/adminActionLog.js')
vi.mock('../jobs/enqueue.js')
vi.mock('./wikidataSearchClient.js')

const ACTOR_ID = 'admin-1'

const ENTITY = {
  id: 'e-1',
  key: 'person:petr-fiala',
  canonicalName: 'Petr Fiala',
  type: 'PERSON' as const,
  storyCount: 4,
  wikidataId: null,
}

describe('getWikidataCandidates', () => {
  beforeEach(() => vi.resetAllMocks())

  it('proxies the search client once the entity is confirmed to exist', async () => {
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue(ENTITY)
    const candidates = [{ qid: 'Q123', label: 'Petr Fiala', description: 'Czech politician' }]
    vi.mocked(searchWikidataEntities).mockResolvedValue(candidates)

    await expect(getWikidataCandidates('person:petr-fiala', 'Petr Fiala')).resolves.toEqual(candidates)
    expect(searchWikidataEntities).toHaveBeenCalledWith('Petr Fiala')
  })

  it('throws NotFoundError for an unknown entity key without calling Wikidata', async () => {
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue(null)

    await expect(getWikidataCandidates('person:nobody', 'query')).rejects.toThrow(NotFoundError)
    expect(searchWikidataEntities).not.toHaveBeenCalled()
  })

  it('throws ValidationError for a blank query without calling Wikidata', async () => {
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue(ENTITY)

    await expect(getWikidataCandidates('person:petr-fiala', '   ')).rejects.toThrow(ValidationError)
    expect(searchWikidataEntities).not.toHaveBeenCalled()
  })
})

describe('linkEntityWikidata', () => {
  beforeEach(() => vi.resetAllMocks())

  it('persists the link, logs the admin action, and enqueues entity.image.enrich after it commits', async () => {
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue(ENTITY)
    vi.mocked(entityRepo.setEntityWikidataId).mockResolvedValue(undefined)

    await linkEntityWikidata('person:petr-fiala', 'Q123', ACTOR_ID)

    expect(entityRepo.setEntityWikidataId).toHaveBeenCalledWith('e-1', 'Q123')
    expect(adminActionLogRepo.recordAdminActionSafe).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      action: 'entity.wikidata_linked',
      targetType: 'entity',
      targetId: 'e-1',
    })
    expect(enqueueJob).toHaveBeenCalledWith(JobName.EntityImageEnrich, { entityId: 'e-1' })

    // The enqueue call happens after setEntityWikidataId has already resolved (the link is
    // committed), never before or concurrently with it.
    const setOrder = vi.mocked(entityRepo.setEntityWikidataId).mock.invocationCallOrder[0]
    const enqueueOrder = vi.mocked(enqueueJob).mock.invocationCallOrder[0]
    expect(enqueueOrder).toBeGreaterThan(setOrder)
  })

  it('throws NotFoundError for an unknown entity key without writing or enqueueing anything', async () => {
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue(null)

    await expect(linkEntityWikidata('person:nobody', 'Q123', ACTOR_ID)).rejects.toThrow(NotFoundError)
    expect(entityRepo.setEntityWikidataId).not.toHaveBeenCalled()
    expect(enqueueJob).not.toHaveBeenCalled()
  })

  it('does not throw when the enqueue call itself fails — the link must still succeed', async () => {
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue(ENTITY)
    vi.mocked(entityRepo.setEntityWikidataId).mockResolvedValue(undefined)
    vi.mocked(enqueueJob).mockRejectedValue(new Error('queue down'))

    await expect(linkEntityWikidata('person:petr-fiala', 'Q123', ACTOR_ID)).resolves.toBeUndefined()
    expect(adminActionLogRepo.recordAdminActionSafe).toHaveBeenCalled()
  })
})

describe('unlinkEntityWikidata', () => {
  beforeEach(() => vi.resetAllMocks())

  it('clears the link and logs the admin action', async () => {
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue({ ...ENTITY, wikidataId: 'Q123' })
    vi.mocked(entityRepo.clearEntityWikidataId).mockResolvedValue(undefined)

    await unlinkEntityWikidata('person:petr-fiala', ACTOR_ID)

    expect(entityRepo.clearEntityWikidataId).toHaveBeenCalledWith('e-1')
    expect(adminActionLogRepo.recordAdminActionSafe).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      action: 'entity.wikidata_unlinked',
      targetType: 'entity',
      targetId: 'e-1',
    })
  })

  it('throws NotFoundError for an unknown entity key', async () => {
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue(null)

    await expect(unlinkEntityWikidata('person:nobody', ACTOR_ID)).rejects.toThrow(NotFoundError)
    expect(entityRepo.clearEntityWikidataId).not.toHaveBeenCalled()
  })
})
