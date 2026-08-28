import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runEntityImageEnrichJob } from './entityImageEnrichJob.js'
import { findWikidataEntityImage } from '../services/wikimediaImageClient.js'
import { findWikidataContext } from '../services/wikipediaClient.js'
import type { EntityRecord } from '../repositories/entity.js'

vi.mock('../services/wikimediaImageClient.js')
vi.mock('../services/wikipediaClient.js')

const ENTITY: EntityRecord = {
  id: 'e-1',
  key: 'person:petr-fiala',
  canonicalName: 'Petr Fiala',
  type: 'PERSON',
  storyCount: 4,
  wikidataId: 'Q123',
  wikidataDescription: null,
  wikipediaExtract: null,
  wikipediaUrl: null,
}

const IMAGE = {
  externalId: 'Petr Fiala 2022.jpg',
  imageUrl: 'https://upload.wikimedia.org/full/Petr_Fiala_2022.jpg',
  thumbnailUrl: 'https://upload.wikimedia.org/thumb/Petr_Fiala_2022.jpg',
  author: 'Jane Doe',
  license: 'CC BY-SA 4.0',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Petr_Fiala_2022.jpg',
  width: 4000,
  height: 3000,
}

const CONTEXT = {
  description: 'český politik a politolog',
  wikipediaExtract: 'Petr Fiala je český politik…',
  wikipediaUrl: 'https://cs.wikipedia.org/wiki/Petr_Fiala',
}

function makeDeps(overrides: Partial<Parameters<typeof runEntityImageEnrichJob>[1]> = {}) {
  return {
    findEntityById: vi.fn().mockResolvedValue(ENTITY),
    findEntityImageForEntity: vi.fn().mockResolvedValue(null),
    createEntityImage: vi.fn().mockResolvedValue(undefined),
    updateEntityWikidataContext: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('runEntityImageEnrichJob', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(findWikidataContext).mockResolvedValue({
      description: null,
      wikipediaExtract: null,
      wikipediaUrl: null,
    })
  })

  it('creates an EntityImage row for a found image', async () => {
    vi.mocked(findWikidataEntityImage).mockResolvedValue(IMAGE)
    const deps = makeDeps()

    await runEntityImageEnrichJob({ entityId: 'e-1' }, deps)

    expect(findWikidataEntityImage).toHaveBeenCalledWith('Q123')
    expect(deps.createEntityImage).toHaveBeenCalledWith({
      entityId: 'e-1',
      provider: 'WIKIMEDIA',
      ...IMAGE,
    })
  })

  it('completes with no row and no throw when no image is found', async () => {
    vi.mocked(findWikidataEntityImage).mockResolvedValue(null)
    const deps = makeDeps()

    await expect(runEntityImageEnrichJob({ entityId: 'e-1' }, deps)).resolves.toBeUndefined()
    expect(deps.createEntityImage).not.toHaveBeenCalled()
  })

  it('completes with no row and no throw when the Wikimedia lookup fails', async () => {
    vi.mocked(findWikidataEntityImage).mockRejectedValue(new Error('HTTP 503'))
    const deps = makeDeps()

    await expect(runEntityImageEnrichJob({ entityId: 'e-1' }, deps)).resolves.toBeUndefined()
    expect(deps.createEntityImage).not.toHaveBeenCalled()
  })

  it('skips both steps without any external call when the Entity no longer exists', async () => {
    const deps = makeDeps({ findEntityById: vi.fn().mockResolvedValue(null) })

    await runEntityImageEnrichJob({ entityId: 'gone' }, deps)

    expect(findWikidataEntityImage).not.toHaveBeenCalled()
    expect(findWikidataContext).not.toHaveBeenCalled()
    expect(deps.createEntityImage).not.toHaveBeenCalled()
    expect(deps.updateEntityWikidataContext).not.toHaveBeenCalled()
  })

  it('skips both steps when the Entity has since been unlinked', async () => {
    const deps = makeDeps({ findEntityById: vi.fn().mockResolvedValue({ ...ENTITY, wikidataId: null }) })

    await runEntityImageEnrichJob({ entityId: 'e-1' }, deps)

    expect(findWikidataEntityImage).not.toHaveBeenCalled()
    expect(findWikidataContext).not.toHaveBeenCalled()
  })

  it('skips the image step but still enriches context when an EntityImage already exists', async () => {
    vi.mocked(findWikidataContext).mockResolvedValue(CONTEXT)
    const deps = makeDeps({ findEntityImageForEntity: vi.fn().mockResolvedValue({ id: 'img-1' }) })

    await runEntityImageEnrichJob({ entityId: 'e-1' }, deps)

    expect(findWikidataEntityImage).not.toHaveBeenCalled()
    expect(deps.createEntityImage).not.toHaveBeenCalled()
    expect(deps.updateEntityWikidataContext).toHaveBeenCalledWith('e-1', CONTEXT)
  })

  it('persists external context (description + Wikipedia extract) when found', async () => {
    vi.mocked(findWikidataEntityImage).mockResolvedValue(null)
    vi.mocked(findWikidataContext).mockResolvedValue(CONTEXT)
    const deps = makeDeps()

    await runEntityImageEnrichJob({ entityId: 'e-1' }, deps)

    expect(deps.updateEntityWikidataContext).toHaveBeenCalledWith('e-1', CONTEXT)
  })

  it('persists a description-only context (no Czech Wikipedia page)', async () => {
    vi.mocked(findWikidataContext).mockResolvedValue({
      description: 'český politik',
      wikipediaExtract: null,
      wikipediaUrl: null,
    })
    const deps = makeDeps()

    await runEntityImageEnrichJob({ entityId: 'e-1' }, deps)

    expect(deps.updateEntityWikidataContext).toHaveBeenCalledWith('e-1', {
      description: 'český politik',
      wikipediaExtract: null,
      wikipediaUrl: null,
    })
  })

  it('does not touch context when the lookup returns nothing at all', async () => {
    const deps = makeDeps()

    await runEntityImageEnrichJob({ entityId: 'e-1' }, deps)

    expect(deps.updateEntityWikidataContext).not.toHaveBeenCalled()
  })

  it('tolerates a context-lookup failure without touching context or affecting the image step', async () => {
    vi.mocked(findWikidataEntityImage).mockResolvedValue(IMAGE)
    vi.mocked(findWikidataContext).mockRejectedValue(new Error('HTTP 503'))
    const deps = makeDeps()

    await expect(runEntityImageEnrichJob({ entityId: 'e-1' }, deps)).resolves.toBeUndefined()
    expect(deps.createEntityImage).toHaveBeenCalled()
    expect(deps.updateEntityWikidataContext).not.toHaveBeenCalled()
  })

  it('skips the context step on redelivery when context is already stored', async () => {
    const deps = makeDeps({
      findEntityById: vi.fn().mockResolvedValue({ ...ENTITY, wikidataDescription: 'already here' }),
    })

    await runEntityImageEnrichJob({ entityId: 'e-1' }, deps)

    expect(findWikidataContext).not.toHaveBeenCalled()
    expect(deps.updateEntityWikidataContext).not.toHaveBeenCalled()
  })
})
