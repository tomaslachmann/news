import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runThreadRecomputeJob, inferRole } from './threadRecomputeJob.js'

const { mockRunThreadTitlePass } = vi.hoisted(() => ({
  mockRunThreadTitlePass: vi.fn(),
}))

vi.mock('../services/threadTitlePass.js', () => ({
  runThreadTitlePass: mockRunThreadTitlePass,
}))

function member(storyId: string, hoursAgo: number) {
  return { storyId, eventTime: new Date(Date.now() - hoursAgo * 60 * 60 * 1000) }
}

describe('inferRole', () => {
  it('assigns ORIGIN to the first position regardless of total', () => {
    expect(inferRole(0, 2)).toBe('ORIGIN')
    expect(inferRole(0, 5)).toBe('ORIGIN')
  })

  it('assigns RESOLUTION to the last position only when there are at least 3 members', () => {
    expect(inferRole(2, 3)).toBe('RESOLUTION')
    expect(inferRole(4, 5)).toBe('RESOLUTION')
  })

  it('does not assign RESOLUTION to the second of only two members — DEVELOPMENT instead', () => {
    expect(inferRole(1, 2)).toBe('DEVELOPMENT')
  })

  it('assigns DEVELOPMENT to every position strictly between first and last', () => {
    expect(inferRole(1, 3)).toBe('DEVELOPMENT')
    expect(inferRole(2, 5)).toBe('DEVELOPMENT')
  })

  it('never produces REACTION', () => {
    for (let total = 2; total <= 6; total++) {
      for (let position = 0; position < total; position++) {
        expect(inferRole(position, total)).not.toBe('REACTION')
      }
    }
  })
})

describe('runThreadRecomputeJob', () => {
  beforeEach(() => vi.resetAllMocks())

  const baseDeps = {
    findAgreementForTitle: vi.fn(),
    upsertThreadFromComponent: vi.fn(),
  }

  it('logs and returns without upserting when the component has fewer than 2 members', async () => {
    const findFollowUpComponent = vi.fn().mockResolvedValue([member('s1', 1)])
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

    await runThreadRecomputeJob({ seedStoryId: 's1' }, { ...baseDeps, findFollowUpComponent }, log as never)

    expect(baseDeps.upsertThreadFromComponent).not.toHaveBeenCalled()
    expect(log.info).toHaveBeenCalled()
  })

  it('derives the title from flattened Agreement across every member and assigns roles/positions in eventTime order', async () => {
    const findFollowUpComponent = vi
      .fn()
      .mockResolvedValue([member('origin', 48), member('middle', 24), member('last', 1)])
    const findAgreementForTitle = vi.fn().mockResolvedValue([
      { storyId: 'origin', displayTitle: 'Origin title', agreementProse: ['Fact 1'] },
      { storyId: 'middle', displayTitle: 'Middle title', agreementProse: ['Fact 2'] },
      { storyId: 'last', displayTitle: 'Last title', agreementProse: [] },
    ])
    mockRunThreadTitlePass.mockResolvedValue('Derived title')
    const upsertThreadFromComponent = vi.fn().mockResolvedValue({ id: 't1' })

    await runThreadRecomputeJob(
      { seedStoryId: 'origin' },
      { findFollowUpComponent, findAgreementForTitle, upsertThreadFromComponent }
    )

    expect(mockRunThreadTitlePass).toHaveBeenCalledWith([['Fact 1'], ['Fact 2'], []], undefined)
    expect(upsertThreadFromComponent).toHaveBeenCalledWith(
      [
        { storyId: 'origin', position: 0, role: 'ORIGIN' },
        { storyId: 'middle', position: 1, role: 'DEVELOPMENT' },
        { storyId: 'last', position: 2, role: 'RESOLUTION' },
      ],
      expect.objectContaining({}),
      expect.objectContaining({ title: 'Derived title' })
    )
    const [, , createIfMissing] = upsertThreadFromComponent.mock.calls[0] as [
      unknown,
      unknown,
      { slug: string },
    ]
    expect(createIfMissing.slug).toContain('origin')
  })

  it("falls back to the ORIGIN member's own display title when title generation fails, without failing the job", async () => {
    const findFollowUpComponent = vi.fn().mockResolvedValue([member('origin', 48), member('other', 1)])
    const findAgreementForTitle = vi.fn().mockResolvedValue([
      { storyId: 'origin', displayTitle: 'Origin fallback title', agreementProse: [] },
      { storyId: 'other', displayTitle: 'Other title', agreementProse: [] },
    ])
    mockRunThreadTitlePass.mockRejectedValue(new Error('LLM down'))
    const upsertThreadFromComponent = vi.fn().mockResolvedValue({ id: 't1' })
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

    await runThreadRecomputeJob(
      { seedStoryId: 'origin' },
      { findFollowUpComponent, findAgreementForTitle, upsertThreadFromComponent },
      log as never
    )

    expect(log.warn).toHaveBeenCalled()
    expect(upsertThreadFromComponent).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Object),
      expect.objectContaining({ title: 'Origin fallback title' })
    )
  })

  it('propagates a component-fetch failure as retryable, never swallowing it', async () => {
    const findFollowUpComponent = vi.fn().mockRejectedValue(new Error('DB down'))

    await expect(
      runThreadRecomputeJob({ seedStoryId: 's1' }, { ...baseDeps, findFollowUpComponent })
    ).rejects.toThrow()

    expect(baseDeps.upsertThreadFromComponent).not.toHaveBeenCalled()
  })

  it('propagates an upsert failure as retryable', async () => {
    const findFollowUpComponent = vi.fn().mockResolvedValue([member('s1', 2), member('s2', 1)])
    const findAgreementForTitle = vi
      .fn()
      .mockResolvedValue([{ storyId: 's1', displayTitle: 'x', agreementProse: [] }])
    mockRunThreadTitlePass.mockResolvedValue('title')
    const upsertThreadFromComponent = vi.fn().mockRejectedValue(new Error('DB down'))

    await expect(
      runThreadRecomputeJob(
        { seedStoryId: 's1' },
        { findFollowUpComponent, findAgreementForTitle, upsertThreadFromComponent }
      )
    ).rejects.toThrow()
  })
})
