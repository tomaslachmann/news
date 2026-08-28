import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  runEntityWikidataScan,
  AUTO_WIKIDATA_ACTOR,
  type EntityWikidataScanDeps,
} from './entityWikidataScanService.js'
import { ReconcileUnavailableError } from './wikidataReconcileClient.js'
import type { WikidataItemDetail } from './wikidataSearchClient.js'
import type { ScanEntity } from '../repositories/entityWikidataSuggestion.js'

const ENTITY: ScanEntity = {
  id: 'e-1',
  key: 'person:petr-fiala',
  canonicalName: 'Petr Fiala',
  type: 'PERSON',
}

function detail(overrides: Partial<WikidataItemDetail> = {}): WikidataItemDetail {
  return {
    qid: 'Q3377548',
    label: 'Petr Fiala',
    names: ['Petr Fiala'],
    description: 'český politik',
    p31: ['Q5'],
    sitelinkCount: 30,
    hasCswikiSitelink: true,
    ...overrides,
  }
}

function makeDeps(overrides: Partial<EntityWikidataScanDeps> = {}): EntityWikidataScanDeps {
  return {
    findUnlinkedEntitiesForScan: vi.fn().mockResolvedValue([ENTITY]),
    countUnlinkedEntitiesForScan: vi.fn().mockResolvedValue(1),
    findRejectedQidsByEntity: vi.fn().mockResolvedValue([]),
    upsertSuggestion: vi.fn().mockResolvedValue(undefined),
    deleteSuggestion: vi.fn().mockResolvedValue(undefined),
    setEntityWikidataId: vi.fn().mockResolvedValue(undefined),
    recordAdminAction: vi.fn().mockResolvedValue(undefined),
    enqueueImageEnrich: vi.fn().mockResolvedValue(undefined),
    resolveByCswikiTitle: vi.fn().mockResolvedValue(detail()),
    searchTypedCandidates: vi.fn().mockResolvedValue(['Q3377548']),
    fetchItemDetails: vi.fn().mockResolvedValue([]),
    reconcile: vi.fn().mockResolvedValue({ qid: 'Q3377548', score: 97, match: true }),
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('runEntityWikidataScan — auto-link path', () => {
  it('auto-links when the gate passes and reconciliation agrees', async () => {
    const deps = makeDeps()

    const result = await runEntityWikidataScan(deps)

    expect(deps.setEntityWikidataId).toHaveBeenCalledWith('e-1', 'Q3377548')
    expect(deps.recordAdminAction).toHaveBeenCalledWith({
      actorId: AUTO_WIKIDATA_ACTOR,
      action: 'entity.wikidata_autolinked',
      targetType: 'entity',
      targetId: 'e-1',
    })
    expect(deps.enqueueImageEnrich).toHaveBeenCalledWith('e-1')
    expect(deps.deleteSuggestion).toHaveBeenCalledWith('e-1')
    expect(deps.upsertSuggestion).not.toHaveBeenCalled()
    expect(result).toMatchObject({ scanned: 1, autoLinked: 1, queued: 0 })
  })
})

describe('runEntityWikidataScan — routes to the queue instead of auto-linking', () => {
  it('queues when a same-type rival also matches the name exactly', async () => {
    const deps = makeDeps({
      searchTypedCandidates: vi.fn().mockResolvedValue(['Q3377548', 'Q999']),
      fetchItemDetails: vi.fn().mockResolvedValue([detail({ qid: 'Q999' })]),
    })

    const result = await runEntityWikidataScan(deps)

    expect(deps.setEntityWikidataId).not.toHaveBeenCalled()
    expect(deps.upsertSuggestion).toHaveBeenCalledWith(
      'e-1',
      expect.arrayContaining([
        expect.objectContaining({ qid: 'Q3377548' }),
        expect.objectContaining({ qid: 'Q999' }),
      ])
    )
    expect(result).toMatchObject({ autoLinked: 0, queued: 1 })
  })

  it('logs a per-entity line naming why each queued entity did not auto-link', async () => {
    const deps = makeDeps({
      resolveByCswikiTitle: vi.fn().mockResolvedValue(detail({ hasCswikiSitelink: false })),
    })
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

    await runEntityWikidataScan(deps, log as never)

    expect(log.info).toHaveBeenCalledWith(
      { entityKey: 'person:petr-fiala', candidateCount: 1, reason: 'položka nemá článek na cs.wikipedia' },
      'entity.wikidata.scan: queued for review'
    )
  })

  it('queues when reconciliation is unavailable (429 / timeout)', async () => {
    const deps = makeDeps({
      reconcile: vi.fn().mockRejectedValue(new ReconcileUnavailableError('HTTP 429')),
    })

    const result = await runEntityWikidataScan(deps)

    expect(deps.setEntityWikidataId).not.toHaveBeenCalled()
    expect(deps.upsertSuggestion).toHaveBeenCalled()
    expect(result).toMatchObject({ autoLinked: 0, queued: 1 })
  })

  it('queues when reconciliation names a different Q-id', async () => {
    const deps = makeDeps({
      reconcile: vi.fn().mockResolvedValue({ qid: 'Q-other', score: 99, match: true }),
    })

    await runEntityWikidataScan(deps)

    expect(deps.setEntityWikidataId).not.toHaveBeenCalled()
    expect(deps.upsertSuggestion).toHaveBeenCalled()
  })

  it('queues when reconciliation returns the right Q-id but match:false', async () => {
    const deps = makeDeps({
      reconcile: vi.fn().mockResolvedValue({ qid: 'Q3377548', score: 80, match: false }),
    })

    await runEntityWikidataScan(deps)

    expect(deps.setEntityWikidataId).not.toHaveBeenCalled()
    expect(deps.upsertSuggestion).toHaveBeenCalled()
  })
})

describe('runEntityWikidataScan — rejections and edge cases', () => {
  it('excludes an already-rejected Q-id and skips (clearing any stale suggestion) when nothing remains', async () => {
    const deps = makeDeps({
      findRejectedQidsByEntity: vi.fn().mockResolvedValue(['Q3377548']),
      searchTypedCandidates: vi.fn().mockResolvedValue(['Q3377548']),
    })

    const result = await runEntityWikidataScan(deps)

    expect(deps.setEntityWikidataId).not.toHaveBeenCalled()
    expect(deps.upsertSuggestion).not.toHaveBeenCalled()
    expect(deps.deleteSuggestion).toHaveBeenCalledWith('e-1')
    expect(result).toMatchObject({ scanned: 1, autoLinked: 0, queued: 0, skipped: 1 })
  })

  it('reports how many entities were left for the next run', async () => {
    const deps = makeDeps({
      findUnlinkedEntitiesForScan: vi.fn().mockResolvedValue([ENTITY]),
      countUnlinkedEntitiesForScan: vi.fn().mockResolvedValue(40),
    })

    const result = await runEntityWikidataScan(deps)

    expect(result.remaining).toBe(39)
  })

  it('keeps going when one entity throws mid-scan', async () => {
    const second: ScanEntity = { ...ENTITY, id: 'e-2', key: 'person:x', canonicalName: 'X' }
    const deps = makeDeps({
      findUnlinkedEntitiesForScan: vi.fn().mockResolvedValue([ENTITY, second]),
      countUnlinkedEntitiesForScan: vi.fn().mockResolvedValue(2),
      resolveByCswikiTitle: vi
        .fn()
        .mockRejectedValueOnce(new Error('Wikidata 503'))
        .mockResolvedValueOnce(detail({ qid: 'Q-x', names: ['X'], label: 'X' })),
      searchTypedCandidates: vi.fn().mockResolvedValue(['Q-x']),
      reconcile: vi.fn().mockResolvedValue({ qid: 'Q-x', score: 97, match: true }),
    })

    const result = await runEntityWikidataScan(deps)

    expect(result.scanned).toBe(2)
    expect(result.skipped).toBe(1)
    expect(result.autoLinked).toBe(1)
  })
})
