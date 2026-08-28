import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as entityRepo from '../repositories/entity.js'
import * as adminActionLogRepo from '../repositories/adminActionLog.js'
import { enqueueJob } from '../jobs/enqueue.js'
import { JobName } from '../jobs/jobDefinitions.js'
import { searchWikidataEntities } from './wikidataSearchClient.js'
import * as suggestionRepo from '../repositories/entityWikidataSuggestion.js'
import {
  confirmWikidataSuggestion,
  dismissWikidataSuggestion,
  getWikidataCandidates,
  getWikidataSuggestions,
  linkEntityWikidata,
  rejectWikidataSuggestionCandidate,
  unlinkEntityWikidata,
} from './entityWikidataService.js'
import { NotFoundError, ValidationError } from '../errors.js'

vi.mock('../repositories/entity.js')
vi.mock('../repositories/adminActionLog.js')
vi.mock('../repositories/entityWikidataSuggestion.js')
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
  wikidataDescription: null,
  wikipediaExtract: null,
  wikipediaUrl: null,
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

  it('is a no-op — no DB write, no audit log — when the entity has no link to begin with', async () => {
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue(ENTITY) // wikidataId: null

    await unlinkEntityWikidata('person:petr-fiala', ACTOR_ID)

    expect(entityRepo.clearEntityWikidataId).not.toHaveBeenCalled()
    expect(adminActionLogRepo.recordAdminActionSafe).not.toHaveBeenCalled()
  })

  it('throws NotFoundError for an unknown entity key', async () => {
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue(null)

    await expect(unlinkEntityWikidata('person:nobody', ACTOR_ID)).rejects.toThrow(NotFoundError)
    expect(entityRepo.clearEntityWikidataId).not.toHaveBeenCalled()
  })
})

const CANDIDATES = [
  { qid: 'Q1', label: 'A', score: 70, reasons: ['přesná shoda jména'] },
  { qid: 'Q2', label: 'B', score: 40, reasons: ['typ nesouhlasí'] },
]

describe('getWikidataSuggestions', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns the raw repository list unchanged', async () => {
    const list = [
      { entityKey: 'person:x', canonicalName: 'X', type: 'PERSON' as const, candidates: CANDIDATES },
    ]
    vi.mocked(suggestionRepo.listSuggestions).mockResolvedValue(list)

    await expect(getWikidataSuggestions()).resolves.toEqual(list)
  })
})

describe('confirmWikidataSuggestion', () => {
  beforeEach(() => vi.resetAllMocks())

  it('links the chosen candidate, logs entity.wikidata_linked, enqueues enrich, and clears the suggestion', async () => {
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue(ENTITY)
    vi.mocked(suggestionRepo.findSuggestionCandidates).mockResolvedValue(CANDIDATES)

    await confirmWikidataSuggestion('person:petr-fiala', 'Q1', ACTOR_ID)

    expect(entityRepo.setEntityWikidataId).toHaveBeenCalledWith('e-1', 'Q1')
    expect(adminActionLogRepo.recordAdminActionSafe).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      action: 'entity.wikidata_linked',
      targetType: 'entity',
      targetId: 'e-1',
    })
    expect(enqueueJob).toHaveBeenCalledWith(JobName.EntityImageEnrich, { entityId: 'e-1' })
    expect(suggestionRepo.deleteSuggestion).toHaveBeenCalledWith('e-1')
  })

  it('rejects a Q-id that was never among the suggested candidates', async () => {
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue(ENTITY)
    vi.mocked(suggestionRepo.findSuggestionCandidates).mockResolvedValue(CANDIDATES)

    await expect(confirmWikidataSuggestion('person:petr-fiala', 'Q999', ACTOR_ID)).rejects.toThrow(
      ValidationError
    )
    expect(entityRepo.setEntityWikidataId).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the entity has no pending suggestion', async () => {
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue(ENTITY)
    vi.mocked(suggestionRepo.findSuggestionCandidates).mockResolvedValue(null)

    await expect(confirmWikidataSuggestion('person:petr-fiala', 'Q1', ACTOR_ID)).rejects.toThrow(
      NotFoundError
    )
  })
})

describe('dismissWikidataSuggestion', () => {
  beforeEach(() => vi.resetAllMocks())

  it('records every shown candidate as rejected, clears the suggestion, and logs the dismissal', async () => {
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue(ENTITY)
    vi.mocked(suggestionRepo.findSuggestionCandidates).mockResolvedValue(CANDIDATES)

    await dismissWikidataSuggestion('person:petr-fiala', ACTOR_ID)

    expect(suggestionRepo.rejectCandidate).toHaveBeenCalledWith('e-1', 'Q1', ACTOR_ID)
    expect(suggestionRepo.rejectCandidate).toHaveBeenCalledWith('e-1', 'Q2', ACTOR_ID)
    expect(suggestionRepo.deleteSuggestion).toHaveBeenCalledWith('e-1')
    expect(adminActionLogRepo.recordAdminActionSafe).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      action: 'entity.wikidata_suggestion_dismissed',
      targetType: 'entity',
      targetId: 'e-1',
    })
  })
})

describe('rejectWikidataSuggestionCandidate', () => {
  beforeEach(() => vi.resetAllMocks())

  it('rejects one Q-id and re-saves the suggestion with the rest', async () => {
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue(ENTITY)
    vi.mocked(suggestionRepo.findSuggestionCandidates).mockResolvedValue(CANDIDATES)

    await rejectWikidataSuggestionCandidate('person:petr-fiala', 'Q1', ACTOR_ID)

    expect(suggestionRepo.rejectCandidate).toHaveBeenCalledWith('e-1', 'Q1', ACTOR_ID)
    expect(suggestionRepo.upsertSuggestion).toHaveBeenCalledWith('e-1', [CANDIDATES[1]])
    expect(suggestionRepo.deleteSuggestion).not.toHaveBeenCalled()
  })

  it('clears the whole suggestion when the last candidate is rejected', async () => {
    vi.mocked(entityRepo.findEntityByKey).mockResolvedValue(ENTITY)
    vi.mocked(suggestionRepo.findSuggestionCandidates).mockResolvedValue([CANDIDATES[0]])

    await rejectWikidataSuggestionCandidate('person:petr-fiala', 'Q1', ACTOR_ID)

    expect(suggestionRepo.upsertSuggestion).not.toHaveBeenCalled()
    expect(suggestionRepo.deleteSuggestion).toHaveBeenCalledWith('e-1')
  })
})
