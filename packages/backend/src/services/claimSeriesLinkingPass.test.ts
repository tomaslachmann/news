import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as llmClientModule from './llmClient.js'
import { runClaimSeriesLinkingPass, type ValueWithCandidates } from './claimSeriesLinkingPass.js'
import type { TrackableValue } from './claimSeriesMatching.js'

vi.mock('./llmClient.js')

function value(overrides: Partial<TrackableValue> = {}): TrackableValue {
  return {
    valueRefId: 'v1',
    text: '18 miliard Kč',
    normalizedValue: 18e9,
    unit: 'CZK',
    sourceIds: ['s1'],
    entityKeys: ['org:mf'],
    ...overrides,
  }
}

const ONE_CANDIDATE_ITEM: ValueWithCandidates = {
  value: value(),
  candidates: [
    {
      seriesId: 'series1',
      entityKeys: ['org:mf'],
      unit: 'CZK',
      normalizedValue: 52e9,
      text: '52 miliard Kč',
    },
  ],
}

describe('runClaimSeriesLinkingPass', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns [] immediately, with no LLM call, when there are no items', async () => {
    const result = await runClaimSeriesLinkingPass([])

    expect(result).toEqual([])
    expect(llmClientModule.callStructuredModel).not.toHaveBeenCalled()
  })

  it('links a value to the series the LLM names', async () => {
    vi.mocked(llmClientModule.callStructuredModel).mockResolvedValue({
      links: [{ valueRefId: 'v1', seriesId: 'series1' }],
    })

    const result = await runClaimSeriesLinkingPass([ONE_CANDIDATE_ITEM])

    expect(result).toEqual([{ valueRefId: 'v1', seriesId: 'series1' }])
  })

  it('starts a new series when the LLM answers null', async () => {
    vi.mocked(llmClientModule.callStructuredModel).mockResolvedValue({
      links: [{ valueRefId: 'v1', seriesId: null }],
    })

    const result = await runClaimSeriesLinkingPass([ONE_CANDIDATE_ITEM])

    expect(result).toEqual([{ valueRefId: 'v1', seriesId: null }])
  })

  it('sends every value with its own candidate list to the LLM', async () => {
    vi.mocked(llmClientModule.callStructuredModel).mockResolvedValue({ links: [] })

    await runClaimSeriesLinkingPass([ONE_CANDIDATE_ITEM])

    const [model, , userContent, callSite] = vi.mocked(llmClientModule.callStructuredModel).mock.calls[0]
    expect(model).toBe('gpt-4o')
    expect(callSite).toBe('claimSeriesLinking')
    const payload = JSON.parse(userContent) as { valueRefId: string; candidates: { seriesId: string }[] }[]
    expect(payload).toEqual([
      {
        valueRefId: 'v1',
        text: '18 miliard Kč',
        candidates: [{ seriesId: 'series1', text: '52 miliard Kč' }],
      },
    ])
  })

  it('retries once and returns the corrected link when a hallucinated seriesId is fixed', async () => {
    vi.mocked(llmClientModule.callStructuredModel)
      .mockResolvedValueOnce({ links: [{ valueRefId: 'v1', seriesId: 'series-hallucinated' }] })
      .mockResolvedValueOnce({ links: [{ valueRefId: 'v1', seriesId: 'series1' }] })

    const result = await runClaimSeriesLinkingPass([ONE_CANDIDATE_ITEM])

    expect(result).toEqual([{ valueRefId: 'v1', seriesId: 'series1' }])
    expect(llmClientModule.callStructuredModel).toHaveBeenCalledTimes(2)
  })

  it("sanitizes a seriesId that belongs to a different value's candidate list to null, per-value, rather than discarding the whole batch", async () => {
    const items: ValueWithCandidates[] = [
      ONE_CANDIDATE_ITEM,
      {
        value: value({ valueRefId: 'v2', entityKeys: ['org:other'] }),
        candidates: [
          { seriesId: 'series2', entityKeys: ['org:other'], unit: 'CZK', normalizedValue: 10e9, text: 'x' },
        ],
      },
    ]
    // v1 correctly links to series1; v2 hallucinates series1 (which belongs to v1, not v2) both
    // times, even after the repair prompt.
    vi.mocked(llmClientModule.callStructuredModel).mockResolvedValue({
      links: [
        { valueRefId: 'v1', seriesId: 'series1' },
        { valueRefId: 'v2', seriesId: 'series1' },
      ],
    })

    const result = await runClaimSeriesLinkingPass(items)

    expect(result).toEqual([
      { valueRefId: 'v1', seriesId: 'series1' },
      { valueRefId: 'v2', seriesId: null },
    ])
  })

  it('starts a new series for every value when the repair response does not match the schema', async () => {
    vi.mocked(llmClientModule.callStructuredModel)
      .mockResolvedValueOnce({ links: [{ valueRefId: 'v1', seriesId: 'series-hallucinated' }] })
      .mockResolvedValueOnce({ not: 'valid' })

    const result = await runClaimSeriesLinkingPass([ONE_CANDIDATE_ITEM])

    expect(result).toEqual([{ valueRefId: 'v1', seriesId: null }])
  })

  it('defaults to a new series for a value the LLM never returned an entry for', async () => {
    vi.mocked(llmClientModule.callStructuredModel).mockResolvedValue({ links: [] })

    const result = await runClaimSeriesLinkingPass([ONE_CANDIDATE_ITEM])

    expect(result).toEqual([{ valueRefId: 'v1', seriesId: null }])
  })

  it('never lets two values from the same batch claim the same seriesId — the second is downgraded to a new series', async () => {
    // Two values from the same member, both legitimately candidate-matched against series1 (e.g.
    // two figures both co-cited with the same entity/unit) — ClaimSeriesMember's own
    // @@unique([seriesId, analysisId]) means this member can only ever contribute one point to
    // series1, so the LLM claiming both would otherwise crash the write with a unique-constraint
    // violation and strand every value after the first.
    const items: ValueWithCandidates[] = [
      ONE_CANDIDATE_ITEM,
      {
        value: value({ valueRefId: 'v2' }),
        candidates: [
          {
            seriesId: 'series1',
            entityKeys: ['org:mf'],
            unit: 'CZK',
            normalizedValue: 52e9,
            text: '52 miliard Kč',
          },
        ],
      },
    ]
    vi.mocked(llmClientModule.callStructuredModel).mockResolvedValue({
      links: [
        { valueRefId: 'v1', seriesId: 'series1' },
        { valueRefId: 'v2', seriesId: 'series1' },
      ],
    })

    const result = await runClaimSeriesLinkingPass(items)

    expect(result).toEqual([
      { valueRefId: 'v1', seriesId: 'series1' },
      { valueRefId: 'v2', seriesId: null },
    ])
  })

  it('retries once on a same-series collision, and still resolves it if the retry repeats the mistake', async () => {
    const items: ValueWithCandidates[] = [
      ONE_CANDIDATE_ITEM,
      {
        value: value({ valueRefId: 'v2' }),
        candidates: [
          { seriesId: 'series1', entityKeys: ['org:mf'], unit: 'CZK', normalizedValue: 52e9, text: 'x' },
        ],
      },
    ]
    const collidingResponse = {
      links: [
        { valueRefId: 'v1', seriesId: 'series1' },
        { valueRefId: 'v2', seriesId: 'series1' },
      ],
    }
    vi.mocked(llmClientModule.callStructuredModel).mockResolvedValue(collidingResponse)

    const result = await runClaimSeriesLinkingPass(items)

    expect(llmClientModule.callStructuredModel).toHaveBeenCalledTimes(2)
    expect(result).toEqual([
      { valueRefId: 'v1', seriesId: 'series1' },
      { valueRefId: 'v2', seriesId: null },
    ])
  })
})
