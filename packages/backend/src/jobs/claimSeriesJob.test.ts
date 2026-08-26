import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRunClaimSeriesLinkingPass } = vi.hoisted(() => ({
  mockRunClaimSeriesLinkingPass: vi.fn(),
}))

vi.mock('../services/claimSeriesLinkingPass.js', () => ({
  runClaimSeriesLinkingPass: mockRunClaimSeriesLinkingPass,
}))

import { runClaimSeriesJob } from './claimSeriesJob.js'
import type { NarrativeDocument } from '@news-triangulator/shared'

function member(analysisId: string, narrative: NarrativeDocument | null) {
  return { analysisId, eventTime: new Date('2026-08-20T00:00:00Z'), narrative }
}

const TRACKABLE_DOCUMENT: NarrativeDocument = {
  version: 1,
  blocks: [],
  assertions: [
    {
      id: 'a1',
      dimension: 'agreement',
      dimensionItemId: 'd1',
      entityRefs: ['e1'],
      sourceRefs: [],
      valueRefs: ['v1'],
    },
  ],
  entityRefs: [{ id: 'e1', entityKey: 'org:mf', canonicalName: 'MF', imageUrl: null }],
  sourceRefs: [],
  valueRefs: [{ id: 'v1', text: '18 miliard Kč', sourceIds: ['s1'], normalizedValue: 18e9, unit: 'CZK' }],
}

describe('runClaimSeriesJob', () => {
  beforeEach(() => vi.resetAllMocks())

  const baseDeps = {
    findVisibleMembersForClaimTracking: vi.fn(),
    findProcessedAnalysisIdsForThread: vi.fn(),
    findLatestSeriesMembersForThread: vi.fn(),
    addClaimSeriesMember: vi.fn(),
  }

  beforeEach(() => {
    baseDeps.findProcessedAnalysisIdsForThread.mockResolvedValue(new Set())
    baseDeps.findLatestSeriesMembersForThread.mockResolvedValue([])
  })

  it('logs and returns when the Thread no longer exists', async () => {
    const findVisibleMembersForClaimTracking = vi.fn().mockResolvedValue(null)
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

    await runClaimSeriesJob(
      { threadId: 't1' },
      { ...baseDeps, findVisibleMembersForClaimTracking },
      log as never
    )

    expect(baseDeps.addClaimSeriesMember).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalled()
  })

  it('is a no-op when every member is already processed (incremental-only property)', async () => {
    const members = [member('a1', TRACKABLE_DOCUMENT)]
    const findVisibleMembersForClaimTracking = vi.fn().mockResolvedValue(members)
    const findProcessedAnalysisIdsForThread = vi.fn().mockResolvedValue(new Set(['a1']))

    await runClaimSeriesJob(
      { threadId: 't1' },
      { ...baseDeps, findVisibleMembersForClaimTracking, findProcessedAnalysisIdsForThread }
    )

    expect(mockRunClaimSeriesLinkingPass).not.toHaveBeenCalled()
    expect(baseDeps.addClaimSeriesMember).not.toHaveBeenCalled()
  })

  it('leaves an unprocessed member with no Narrative yet untouched, rather than treating it as nothing to track', async () => {
    const members = [member('a1', null)]
    const findVisibleMembersForClaimTracking = vi.fn().mockResolvedValue(members)
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

    await runClaimSeriesJob(
      { threadId: 't1' },
      { ...baseDeps, findVisibleMembersForClaimTracking },
      log as never
    )

    expect(baseDeps.addClaimSeriesMember).not.toHaveBeenCalled()
    expect(log.info).toHaveBeenCalled()
  })

  it('never re-processes an already-processed member even when a newer, unprocessed one exists', async () => {
    const members = [member('a1', TRACKABLE_DOCUMENT), member('a2', TRACKABLE_DOCUMENT)]
    const findVisibleMembersForClaimTracking = vi.fn().mockResolvedValue(members)
    const findProcessedAnalysisIdsForThread = vi.fn().mockResolvedValue(new Set(['a1']))
    mockRunClaimSeriesLinkingPass.mockResolvedValue([])

    await runClaimSeriesJob(
      { threadId: 't1' },
      { ...baseDeps, findVisibleMembersForClaimTracking, findProcessedAnalysisIdsForThread }
    )

    expect(baseDeps.addClaimSeriesMember).toHaveBeenCalledTimes(1)
    expect(baseDeps.addClaimSeriesMember).toHaveBeenCalledWith(
      't1',
      null,
      expect.objectContaining({ analysisId: 'a2' })
    )
  })

  it('starts a new series (no LLM call) for a trackable value with zero candidates', async () => {
    const members = [member('a1', TRACKABLE_DOCUMENT)]
    const findVisibleMembersForClaimTracking = vi.fn().mockResolvedValue(members)
    const findLatestSeriesMembersForThread = vi.fn().mockResolvedValue([])

    await runClaimSeriesJob(
      { threadId: 't1' },
      { ...baseDeps, findVisibleMembersForClaimTracking, findLatestSeriesMembersForThread }
    )

    expect(mockRunClaimSeriesLinkingPass).not.toHaveBeenCalled()
    expect(baseDeps.addClaimSeriesMember).toHaveBeenCalledWith(
      't1',
      null,
      expect.objectContaining({ analysisId: 'a1', valueRefId: 'v1', normalizedValue: 18e9, unit: 'CZK' })
    )
  })

  it('joins the series the LLM linking pass names when a candidate exists', async () => {
    const members = [member('a1', TRACKABLE_DOCUMENT)]
    const findVisibleMembersForClaimTracking = vi.fn().mockResolvedValue(members)
    const findLatestSeriesMembersForThread = vi
      .fn()
      .mockResolvedValue([
        { seriesId: 'series1', entityKeys: ['org:mf'], unit: 'CZK', normalizedValue: 52e9, text: 'x' },
      ])
    mockRunClaimSeriesLinkingPass.mockResolvedValue([{ valueRefId: 'v1', seriesId: 'series1' }])

    await runClaimSeriesJob(
      { threadId: 't1' },
      { ...baseDeps, findVisibleMembersForClaimTracking, findLatestSeriesMembersForThread }
    )

    expect(mockRunClaimSeriesLinkingPass).toHaveBeenCalledTimes(1)
    const [items] = mockRunClaimSeriesLinkingPass.mock.calls[0] as [
      { value: { valueRefId: string }; candidates: { seriesId: string }[] }[],
    ]
    expect(items).toHaveLength(1)
    expect(items[0]?.value.valueRefId).toBe('v1')
    expect(items[0]?.candidates.map((c) => c.seriesId)).toEqual(['series1'])
    expect(baseDeps.addClaimSeriesMember).toHaveBeenCalledWith(
      't1',
      'series1',
      expect.objectContaining({ analysisId: 'a1' })
    )
  })

  it('skips a member with no trackable values at all, without calling the LLM or writing anything', async () => {
    const emptyDocument: NarrativeDocument = { ...TRACKABLE_DOCUMENT, valueRefs: [], assertions: [] }
    const members = [member('a1', emptyDocument)]
    const findVisibleMembersForClaimTracking = vi.fn().mockResolvedValue(members)

    await runClaimSeriesJob({ threadId: 't1' }, { ...baseDeps, findVisibleMembersForClaimTracking })

    expect(mockRunClaimSeriesLinkingPass).not.toHaveBeenCalled()
    expect(baseDeps.addClaimSeriesMember).not.toHaveBeenCalled()
  })

  it('propagates a linking-pass failure as retryable, never swallowing it', async () => {
    const members = [member('a1', TRACKABLE_DOCUMENT)]
    const findVisibleMembersForClaimTracking = vi.fn().mockResolvedValue(members)
    const findLatestSeriesMembersForThread = vi
      .fn()
      .mockResolvedValue([
        { seriesId: 'series1', entityKeys: ['org:mf'], unit: 'CZK', normalizedValue: 52e9, text: 'x' },
      ])
    mockRunClaimSeriesLinkingPass.mockRejectedValue(new Error('API down'))

    await expect(
      runClaimSeriesJob(
        { threadId: 't1' },
        { ...baseDeps, findVisibleMembersForClaimTracking, findLatestSeriesMembersForThread }
      )
    ).rejects.toThrow()

    expect(baseDeps.addClaimSeriesMember).not.toHaveBeenCalled()
  })
})
