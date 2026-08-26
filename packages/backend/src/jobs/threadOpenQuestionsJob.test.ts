import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRunThreadOpenQuestionsPass } = vi.hoisted(() => ({
  mockRunThreadOpenQuestionsPass: vi.fn(),
}))

vi.mock('../services/threadOpenQuestionsPass.js', () => ({
  runThreadOpenQuestionsPass: mockRunThreadOpenQuestionsPass,
}))

import { runThreadOpenQuestionsJob } from './threadOpenQuestionsJob.js'

function member(analysisId: string) {
  return { analysisId, eventTime: new Date(), contradiction: [], agreement: [], uniqueReporting: [] }
}

describe('runThreadOpenQuestionsJob', () => {
  beforeEach(() => vi.resetAllMocks())

  const baseDeps = {
    findVisibleMembersForOpenQuestions: vi.fn(),
    updateThreadOpenQuestions: vi.fn(),
  }

  it('logs and returns without calling the LLM when the Thread no longer exists', async () => {
    const findVisibleMembersForOpenQuestions = vi.fn().mockResolvedValue(null)
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

    await runThreadOpenQuestionsJob(
      { threadId: 't1' },
      { ...baseDeps, findVisibleMembersForOpenQuestions },
      log as never
    )

    expect(mockRunThreadOpenQuestionsPass).not.toHaveBeenCalled()
    expect(baseDeps.updateThreadOpenQuestions).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalled()
  })

  it('logs and returns without calling the LLM when fewer than 2 members are visible', async () => {
    const findVisibleMembersForOpenQuestions = vi.fn().mockResolvedValue([member('a1')])
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

    await runThreadOpenQuestionsJob(
      { threadId: 't1' },
      { ...baseDeps, findVisibleMembersForOpenQuestions },
      log as never
    )

    expect(mockRunThreadOpenQuestionsPass).not.toHaveBeenCalled()
    expect(log.info).toHaveBeenCalled()
  })

  it('runs the LLM pass and persists its result when at least 2 members are visible', async () => {
    const members = [member('a1'), member('a2')]
    const findVisibleMembersForOpenQuestions = vi.fn().mockResolvedValue(members)
    const openQuestions = [
      { question: 'x', detail: 'y', relatedItems: [{ analysisId: 'a1', dimensionItemId: 'd1' }] },
    ]
    mockRunThreadOpenQuestionsPass.mockResolvedValue(openQuestions)
    const updateThreadOpenQuestions = vi.fn()

    await runThreadOpenQuestionsJob(
      { threadId: 't1' },
      { findVisibleMembersForOpenQuestions, updateThreadOpenQuestions }
    )

    expect(mockRunThreadOpenQuestionsPass).toHaveBeenCalledWith(members, undefined)
    expect(updateThreadOpenQuestions).toHaveBeenCalledWith('t1', openQuestions)
  })

  it('propagates an LLM-pass failure as retryable, never swallowing it', async () => {
    const findVisibleMembersForOpenQuestions = vi.fn().mockResolvedValue([member('a1'), member('a2')])
    mockRunThreadOpenQuestionsPass.mockRejectedValue(new Error('API down'))

    await expect(
      runThreadOpenQuestionsJob({ threadId: 't1' }, { ...baseDeps, findVisibleMembersForOpenQuestions })
    ).rejects.toThrow()

    expect(baseDeps.updateThreadOpenQuestions).not.toHaveBeenCalled()
  })
})
