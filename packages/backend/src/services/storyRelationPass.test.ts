import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as llmClientModule from './llmClient.js'
import {
  confirmStoryRelation,
  linkStoryRelations,
  extractEntitiesAndLinkStoryRelations,
  RELATION_SHORTLIST_SIZE,
} from './storyRelationPass.js'
import { ExternalServiceError } from '../errors.js'

vi.mock('./llmClient.js')

const CURRENT = { anchorHeadline: 'Story A headline', createdAt: new Date('2026-01-15T00:00:00Z') }
const CANDIDATE = { anchorHeadline: 'Story B headline', createdAt: new Date('2026-01-10T00:00:00Z') }

describe('confirmStoryRelation', () => {
  beforeEach(() => vi.resetAllMocks())

  it('calls callJsonModel with both headlines, tagged with the storyRelation callSite, and returns the verdict', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({
      related: true,
      type: 'FOLLOW_UP',
      confidenceTier: 'HIGH',
      reasoning: 'Story A is a direct continuation of Story B.',
    })

    const result = await confirmStoryRelation(CURRENT, CANDIDATE)

    const [model, systemPrompt, userContent, callSite] = vi.mocked(llmClientModule.callJsonModel).mock
      .calls[0]
    expect(typeof model).toBe('string')
    expect(typeof systemPrompt).toBe('string')
    expect(callSite).toBe('storyRelation')
    expect(JSON.parse(userContent)).toEqual({
      storyA: { headline: CURRENT.anchorHeadline, publishedAt: CURRENT.createdAt.toISOString() },
      storyB: { headline: CANDIDATE.anchorHeadline, publishedAt: CANDIDATE.createdAt.toISOString() },
    })
    expect(result).toEqual({
      related: true,
      type: 'FOLLOW_UP',
      confidenceTier: 'HIGH',
      reasoning: 'Story A is a direct continuation of Story B.',
    })
  })

  it('returns {related: false} unmodified when the model finds no connection', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({ related: false })

    const result = await confirmStoryRelation(CURRENT, CANDIDATE)

    expect(result).toEqual({ related: false })
  })

  it('throws when a related:true response is missing required fields', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({ related: true, type: 'FOLLOW_UP' })

    await expect(confirmStoryRelation(CURRENT, CANDIDATE)).rejects.toThrow()
  })

  it('throws when type is outside the closed enum (e.g. a causal type)', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({
      related: true,
      type: 'CAUSES',
      confidenceTier: 'HIGH',
      reasoning: 'x',
    })

    await expect(confirmStoryRelation(CURRENT, CANDIDATE)).rejects.toThrow()
  })

  it('propagates a thrown error rather than swallowing it', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockRejectedValue(new Error('API down'))

    await expect(confirmStoryRelation(CURRENT, CANDIDATE)).rejects.toThrow('API down')
  })
})

describe('linkStoryRelations', () => {
  beforeEach(() => vi.resetAllMocks())

  const TOTAL_STORIES = 100

  function makeCandidate(storyId: string) {
    return {
      storyId,
      analysisId: `a-${storyId}`,
      anchorHeadline: `Headline for ${storyId}`,
      embedding: [1, 0, 0],
      entities: [],
      entityRelations: [],
      createdAt: new Date('2026-01-14T00:00:00Z'),
    }
  }

  const CURRENT_INPUT = {
    anchorHeadline: 'Current story',
    createdAt: new Date('2026-01-15T00:00:00Z'),
    embedding: [1, 0, 0],
    entities: [],
    entityRelations: [],
  }

  it('persists a HIGH-confidence relation as PUBLISHED and a LOW-confidence one as PENDING_REVIEW', async () => {
    const candidates = [makeCandidate('high'), makeCandidate('low')]
    vi.mocked(llmClientModule.callJsonModel)
      .mockResolvedValueOnce({ related: true, type: 'FOLLOW_UP', confidenceTier: 'HIGH', reasoning: 'r1' })
      .mockResolvedValueOnce({ related: true, type: 'RELATED', confidenceTier: 'LOW', reasoning: 'r2' })
    const createStoryRelation = vi.fn().mockResolvedValue(undefined)

    await linkStoryRelations('story-current', CURRENT_INPUT, candidates, TOTAL_STORIES, {
      createStoryRelation,
    })

    expect(createStoryRelation).toHaveBeenCalledWith({
      fromStoryId: 'story-current',
      toStoryId: 'high',
      type: 'FOLLOW_UP',
      confidenceTier: 'HIGH',
      reasoning: 'r1',
      status: 'PUBLISHED',
    })
    expect(createStoryRelation).toHaveBeenCalledWith({
      fromStoryId: 'story-current',
      toStoryId: 'low',
      type: 'RELATED',
      confidenceTier: 'LOW',
      reasoning: 'r2',
      status: 'PENDING_REVIEW',
    })
  })

  it('does not persist anything for a candidate the model judges unrelated', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({ related: false })
    const createStoryRelation = vi.fn().mockResolvedValue(undefined)

    await linkStoryRelations('story-current', CURRENT_INPUT, [makeCandidate('c1')], TOTAL_STORIES, {
      createStoryRelation,
    })

    expect(createStoryRelation).not.toHaveBeenCalled()
  })

  it('calls the LLM for at most RELATION_SHORTLIST_SIZE candidates, even when more score above threshold', async () => {
    const manyCandidates = Array.from({ length: RELATION_SHORTLIST_SIZE + 10 }, (_, i) =>
      makeCandidate(`c${i}`)
    )
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({ related: false })
    const createStoryRelation = vi.fn().mockResolvedValue(undefined)

    await linkStoryRelations('story-current', CURRENT_INPUT, manyCandidates, TOTAL_STORIES, {
      createStoryRelation,
    })

    expect(llmClientModule.callJsonModel).toHaveBeenCalledTimes(RELATION_SHORTLIST_SIZE)
  })

  it('continues evaluating remaining candidates when one confirmation call fails', async () => {
    const candidates = [makeCandidate('fails'), makeCandidate('succeeds')]
    vi.mocked(llmClientModule.callJsonModel)
      .mockRejectedValueOnce(new Error('LLM down'))
      .mockResolvedValueOnce({ related: true, type: 'RELATED', confidenceTier: 'HIGH', reasoning: 'r' })
    const createStoryRelation = vi.fn().mockResolvedValue(undefined)

    await expect(
      linkStoryRelations('story-current', CURRENT_INPUT, candidates, TOTAL_STORIES, { createStoryRelation })
    ).resolves.toBeUndefined()

    expect(createStoryRelation).toHaveBeenCalledWith(expect.objectContaining({ toStoryId: 'succeeds' }))
  })

  it('never throws, even when persistence itself fails', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({
      related: true,
      type: 'RELATED',
      confidenceTier: 'HIGH',
      reasoning: 'r',
    })
    const createStoryRelation = vi.fn().mockRejectedValue(new Error('DB down'))

    await expect(
      linkStoryRelations('story-current', CURRENT_INPUT, [makeCandidate('c1')], TOTAL_STORIES, {
        createStoryRelation,
      })
    ).resolves.toBeUndefined()
  })

  it('does not call the LLM at all when no candidate clears the scoring threshold', async () => {
    const unrelatedCandidate = { ...makeCandidate('unrelated'), embedding: [0, 1, 0] }
    const createStoryRelation = vi.fn().mockResolvedValue(undefined)

    await linkStoryRelations('story-current', CURRENT_INPUT, [unrelatedCandidate], TOTAL_STORIES, {
      createStoryRelation,
    })

    expect(llmClientModule.callJsonModel).not.toHaveBeenCalled()
  })
})

describe('extractEntitiesAndLinkStoryRelations', () => {
  beforeEach(() => vi.resetAllMocks())

  const STORY = {
    anchorHeadline: 'Current story',
    createdAt: new Date('2026-01-15T00:00:00Z'),
    embedding: [1, 0, 0],
  }

  const NO_PERSISTED_ENTITIES = { entities: [], entityRelations: [] }

  const RAW_CANDIDATE = {
    storyId: 'candidate-1',
    analysisId: 'a-candidate-1',
    anchorHeadline: 'Candidate headline',
    embedding: [1, 0, 0],
    entities: [],
    entityRelations: [],
    createdAt: new Date('2026-01-14T00:00:00Z'),
  }

  it('persists freshly-extracted entities via replaceStoryEntities when extraction finds something', async () => {
    vi.mocked(llmClientModule.callJsonModel)
      .mockResolvedValueOnce({
        entities: [{ mention: 'New', canonical_name: 'New Person', type: 'PERSON', confidence: 0.9 }],
        entityRelations: [],
      })
      .mockResolvedValueOnce({ related: false })
    const replaceStoryEntities = vi.fn().mockResolvedValue(undefined)
    const findStoryEntitiesForScoring = vi.fn().mockResolvedValue(NO_PERSISTED_ENTITIES)
    const countStories = vi.fn().mockResolvedValue(10)
    const findRelationCandidateStories = vi.fn().mockResolvedValue([RAW_CANDIDATE])
    const createStoryRelation = vi.fn().mockResolvedValue(undefined)

    await extractEntitiesAndLinkStoryRelations('story-1', ['some article text'], STORY, {
      replaceStoryEntities,
      findStoryEntitiesForScoring,
      countStories,
      findRelationCandidateStories,
      createStoryRelation,
    })

    expect(replaceStoryEntities).toHaveBeenCalledWith(
      'story-1',
      [{ key: 'person:new-person', name: 'New Person', type: 'PERSON', confidence: 0.9 }],
      []
    )
    expect(findStoryEntitiesForScoring).toHaveBeenCalledWith('story-1')
    expect(findRelationCandidateStories).toHaveBeenCalledWith('story-1', STORY.createdAt, expect.any(Number))
  })

  it("does not call replaceStoryEntities when extraction finds nothing new, but still scores against findStoryEntitiesForScoring's persisted result", async () => {
    // Weak embedding match on its own (cosine ≈ 0.45, and the candidate's fixed 2026-01-14 date
    // is long past the relation window relative to the real clock this runs against, so time
    // proximity contributes ~0 here) — only entity-key overlap against the persisted "person:old"
    // findStoryEntitiesForScoring returns can push this candidate's score above threshold and
    // trigger an LLM confirmation call. If that persisted result were ignored, this candidate
    // would never clear the threshold and callJsonModel would never be called.
    const weakEmbeddingSharedEntityCandidate = {
      ...RAW_CANDIDATE,
      embedding: [1, 2, 0],
      entities: [{ key: 'person:old', storyCount: 3 }],
    }
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({ related: false })
    const replaceStoryEntities = vi.fn().mockResolvedValue(undefined)
    const findStoryEntitiesForScoring = vi
      .fn()
      .mockResolvedValue({ entities: [{ key: 'person:old', storyCount: 3 }], entityRelations: [] })
    const countStories = vi.fn().mockResolvedValue(10)
    const findRelationCandidateStories = vi.fn().mockResolvedValue([weakEmbeddingSharedEntityCandidate])
    const createStoryRelation = vi.fn().mockResolvedValue(undefined)

    // No source texts at all — runEntityExtractionPass returns an empty result without an LLM
    // call, so extractAndPersistStoryEntities never calls replaceStoryEntities, and scoring must
    // still use findStoryEntitiesForScoring's authoritative, already-persisted result.
    await extractEntitiesAndLinkStoryRelations('story-1', [], STORY, {
      replaceStoryEntities,
      findStoryEntitiesForScoring,
      countStories,
      findRelationCandidateStories,
      createStoryRelation,
    })

    expect(replaceStoryEntities).not.toHaveBeenCalled()
    expect(llmClientModule.callJsonModel).toHaveBeenCalledTimes(1)
  })

  it('rethrows as ExternalServiceError when the candidate-pool fetch fails', async () => {
    const replaceStoryEntities = vi.fn().mockResolvedValue(undefined)
    const findStoryEntitiesForScoring = vi.fn().mockResolvedValue(NO_PERSISTED_ENTITIES)
    const countStories = vi.fn().mockResolvedValue(10)
    const findRelationCandidateStories = vi.fn().mockRejectedValue(new Error('DB down'))
    const createStoryRelation = vi.fn().mockResolvedValue(undefined)

    await expect(
      extractEntitiesAndLinkStoryRelations('story-1', [], STORY, {
        replaceStoryEntities,
        findStoryEntitiesForScoring,
        countStories,
        findRelationCandidateStories,
        createStoryRelation,
      })
    ).rejects.toThrow(ExternalServiceError)

    expect(createStoryRelation).not.toHaveBeenCalled()
  })

  it('rethrows as ExternalServiceError when entity extraction itself fails, without attempting relation-linking', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockRejectedValue(new Error('LLM outage'))
    const replaceStoryEntities = vi.fn().mockResolvedValue(undefined)
    const findStoryEntitiesForScoring = vi.fn().mockResolvedValue(NO_PERSISTED_ENTITIES)
    const countStories = vi.fn().mockResolvedValue(10)
    const findRelationCandidateStories = vi.fn().mockResolvedValue([])
    const createStoryRelation = vi.fn().mockResolvedValue(undefined)

    await expect(
      extractEntitiesAndLinkStoryRelations('story-1', ['some article text'], STORY, {
        replaceStoryEntities,
        findStoryEntitiesForScoring,
        countStories,
        findRelationCandidateStories,
        createStoryRelation,
      })
    ).rejects.toThrow(ExternalServiceError)

    expect(findStoryEntitiesForScoring).not.toHaveBeenCalled()
  })
})
