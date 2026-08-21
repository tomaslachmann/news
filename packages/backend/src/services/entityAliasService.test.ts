import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as entityRepo from '../repositories/entity.js'
import type { EntityRecord } from '../repositories/entity.js'
import * as entityAliasRepo from '../repositories/entityAlias.js'
import * as adminActionLogRepo from '../repositories/adminActionLog.js'
import {
  getEntityAliasCandidates,
  confirmEntityAliasMerge,
  rejectEntityAliasMerge,
} from './entityAliasService.js'
import { NotFoundError, ValidationError } from '../errors.js'

vi.mock('../repositories/entity.js')
vi.mock('../repositories/entityAlias.js')
vi.mock('../repositories/adminActionLog.js')

const ACTOR_ID = 'admin-1'

const ENTITY_A = {
  id: 'e-a',
  key: 'country:usa',
  canonicalName: 'United States',
  type: 'COUNTRY' as const,
  storyCount: 5,
}
const ENTITY_B = {
  id: 'e-b',
  key: 'country:us',
  canonicalName: 'US',
  type: 'COUNTRY' as const,
  storyCount: 3,
}

describe('getEntityAliasCandidates', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns the repository candidates as-is', async () => {
    const candidates = [
      {
        pairId: 'e-a:e-b',
        entityA: { id: 'e-a', canonicalName: 'United States', type: 'COUNTRY' as const, storyCount: 5 },
        entityB: { id: 'e-b', canonicalName: 'US', type: 'COUNTRY' as const, storyCount: 3 },
        similarity: 0.6,
      },
    ]
    vi.mocked(entityAliasRepo.findCandidatePairs).mockResolvedValue(candidates)

    await expect(getEntityAliasCandidates()).resolves.toEqual(candidates)
  })
})

describe('confirmEntityAliasMerge', () => {
  beforeEach(() => vi.resetAllMocks())

  function mockFindEntityById(byId: Record<string, EntityRecord | undefined>) {
    vi.mocked(entityRepo.findEntityById).mockImplementation((id) => Promise.resolve(byId[id] ?? null))
  }

  it('merges the non-surviving side into survivingEntityId and logs the action', async () => {
    vi.mocked(entityAliasRepo.parsePairId).mockReturnValue(['e-a', 'e-b'])
    mockFindEntityById({ 'e-a': ENTITY_A, 'e-b': ENTITY_B })
    vi.mocked(entityAliasRepo.mergeEntities).mockResolvedValue(undefined)

    await confirmEntityAliasMerge('e-a:e-b', 'e-a', ACTOR_ID)

    expect(entityAliasRepo.mergeEntities).toHaveBeenCalledWith('e-a', 'e-b', ACTOR_ID)
    expect(adminActionLogRepo.recordAdminActionSafe).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      action: 'entity.alias_merged',
      targetType: 'entity_alias',
      targetId: 'e-b',
    })
  })

  it('merges the other direction when survivingEntityId is the second id of the pair', async () => {
    vi.mocked(entityAliasRepo.parsePairId).mockReturnValue(['e-a', 'e-b'])
    mockFindEntityById({ 'e-a': ENTITY_A, 'e-b': ENTITY_B })
    vi.mocked(entityAliasRepo.mergeEntities).mockResolvedValue(undefined)

    await confirmEntityAliasMerge('e-a:e-b', 'e-b', ACTOR_ID)

    expect(entityAliasRepo.mergeEntities).toHaveBeenCalledWith('e-b', 'e-a', ACTOR_ID)
  })

  it('throws ValidationError when survivingEntityId is not part of the pair', async () => {
    vi.mocked(entityAliasRepo.parsePairId).mockReturnValue(['e-a', 'e-b'])

    await expect(confirmEntityAliasMerge('e-a:e-b', 'e-other', ACTOR_ID)).rejects.toThrow(ValidationError)
    expect(entityAliasRepo.mergeEntities).not.toHaveBeenCalled()
  })

  it('throws ValidationError for a malformed pairId', async () => {
    vi.mocked(entityAliasRepo.parsePairId).mockImplementation(() => {
      throw new Error('Malformed entity-alias pairId')
    })

    await expect(confirmEntityAliasMerge('not-a-pair-id', 'e-a', ACTOR_ID)).rejects.toThrow(ValidationError)
  })

  it('throws NotFoundError when either entity in the pair no longer exists', async () => {
    vi.mocked(entityAliasRepo.parsePairId).mockReturnValue(['e-a', 'e-b'])
    vi.mocked(entityRepo.findEntityById).mockResolvedValue(null)

    await expect(confirmEntityAliasMerge('e-a:e-b', 'e-a', ACTOR_ID)).rejects.toThrow(NotFoundError)
    expect(entityAliasRepo.mergeEntities).not.toHaveBeenCalled()
  })

  it('throws ValidationError when the two entities have different types', async () => {
    vi.mocked(entityAliasRepo.parsePairId).mockReturnValue(['e-a', 'e-b'])
    mockFindEntityById({ 'e-a': ENTITY_A, 'e-b': { ...ENTITY_B, type: 'PERSON' } })

    await expect(confirmEntityAliasMerge('e-a:e-b', 'e-a', ACTOR_ID)).rejects.toThrow(ValidationError)
    expect(entityAliasRepo.mergeEntities).not.toHaveBeenCalled()
  })

  it('translates a double-confirm race (AlreadyMergedError) into ValidationError', async () => {
    vi.mocked(entityAliasRepo.parsePairId).mockReturnValue(['e-a', 'e-b'])
    mockFindEntityById({ 'e-a': ENTITY_A, 'e-b': ENTITY_B })
    vi.mocked(entityAliasRepo.mergeEntities).mockRejectedValue(
      new entityAliasRepo.AlreadyMergedError('already merged')
    )

    await expect(confirmEntityAliasMerge('e-a:e-b', 'e-a', ACTOR_ID)).rejects.toThrow(ValidationError)
    expect(adminActionLogRepo.recordAdminActionSafe).not.toHaveBeenCalled()
  })
})

describe('rejectEntityAliasMerge', () => {
  beforeEach(() => vi.resetAllMocks())

  it('records the rejection and logs the action', async () => {
    vi.mocked(entityAliasRepo.parsePairId).mockReturnValue(['e-a', 'e-b'])
    vi.mocked(entityAliasRepo.rejectCandidatePair).mockResolvedValue(undefined)

    await rejectEntityAliasMerge('e-a:e-b', ACTOR_ID)

    expect(entityAliasRepo.rejectCandidatePair).toHaveBeenCalledWith('e-a', 'e-b', ACTOR_ID)
    expect(adminActionLogRepo.recordAdminActionSafe).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      action: 'entity.alias_rejected',
      targetType: 'entity_alias',
      targetId: 'e-a:e-b',
    })
  })

  it('throws ValidationError for a malformed pairId', async () => {
    vi.mocked(entityAliasRepo.parsePairId).mockImplementation(() => {
      throw new Error('Malformed entity-alias pairId')
    })

    await expect(rejectEntityAliasMerge('not-a-pair-id', ACTOR_ID)).rejects.toThrow(ValidationError)
    expect(entityAliasRepo.rejectCandidatePair).not.toHaveBeenCalled()
  })
})
