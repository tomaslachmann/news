import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as llmClientModule from './llmClient.js'
import {
  runThreadOpenQuestionsPass,
  findOpenQuestionsVerificationFailures,
  buildVerificationContext,
  type LlmThreadOpenQuestionsDocument,
} from './threadOpenQuestionsPass.js'
import type { ThreadMemberForOpenQuestions } from '../repositories/thread.js'

vi.mock('./llmClient.js')

const MEMBERS: ThreadMemberForOpenQuestions[] = [
  {
    analysisId: 'a1',
    eventTime: new Date('2026-08-20T00:00:00Z'),
    contradiction: [{ id: 'd1', prose: 'Zdroje se neshodují na počtu obětí.' }],
    agreement: [],
    uniqueReporting: [],
  },
  {
    analysisId: 'a2',
    eventTime: new Date('2026-08-22T00:00:00Z'),
    contradiction: [],
    agreement: [{ id: 'd2', prose: 'Počet obětí byl potvrzen na 12.' }],
    uniqueReporting: [],
  },
]

function validDoc(overrides: Partial<LlmThreadOpenQuestionsDocument> = {}): LlmThreadOpenQuestionsDocument {
  return {
    openQuestions: [
      {
        question: 'Byl počet obětí definitivně potvrzen?',
        detail: 'První zdroj uváděl nejistý počet, později byl upřesněn.',
        relatedItems: [{ analysisId: 'a1', dimensionItemId: 'd1' }],
      },
    ],
    ...overrides,
  }
}

describe('buildVerificationContext / findOpenQuestionsVerificationFailures', () => {
  it('returns no failures when every relatedItems entry resolves to a real, visible dimension item', () => {
    const ctx = buildVerificationContext(MEMBERS)
    expect(findOpenQuestionsVerificationFailures(validDoc(), ctx)).toEqual([])
  })

  it('flags an open question with no relatedItems at all', () => {
    const ctx = buildVerificationContext(MEMBERS)
    const doc = validDoc({
      openQuestions: [{ question: 'x', detail: 'y', relatedItems: [] }],
    })
    const failures = findOpenQuestionsVerificationFailures(doc, ctx)
    expect(failures.some((f) => f.includes('at least one'))).toBe(true)
  })

  it('flags a relatedItems entry citing an analysisId that is not a visible member of this Thread', () => {
    const ctx = buildVerificationContext(MEMBERS)
    const doc = validDoc({
      openQuestions: [
        { question: 'x', detail: 'y', relatedItems: [{ analysisId: 'a-missing', dimensionItemId: 'd1' }] },
      ],
    })
    const failures = findOpenQuestionsVerificationFailures(doc, ctx)
    expect(failures.some((f) => f.includes('a-missing'))).toBe(true)
  })

  it('flags a relatedItems entry citing a dimensionItemId that does not exist on that analysis', () => {
    const ctx = buildVerificationContext(MEMBERS)
    const doc = validDoc({
      openQuestions: [
        { question: 'x', detail: 'y', relatedItems: [{ analysisId: 'a1', dimensionItemId: 'd-missing' }] },
      ],
    })
    const failures = findOpenQuestionsVerificationFailures(doc, ctx)
    expect(failures.some((f) => f.includes('d-missing'))).toBe(true)
  })

  it('flags a dimensionItemId that exists, but on a different analysis than cited', () => {
    const ctx = buildVerificationContext(MEMBERS)
    const doc = validDoc({
      // d2 is only on a2, not a1.
      openQuestions: [
        { question: 'x', detail: 'y', relatedItems: [{ analysisId: 'a1', dimensionItemId: 'd2' }] },
      ],
    })
    const failures = findOpenQuestionsVerificationFailures(doc, ctx)
    expect(failures.some((f) => f.includes('d2'))).toBe(true)
  })
})

describe('runThreadOpenQuestionsPass', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns the LLM result unchanged when it is already valid', async () => {
    vi.mocked(llmClientModule.callStructuredModel).mockResolvedValue(validDoc())

    const result = await runThreadOpenQuestionsPass(MEMBERS)

    expect(result).toEqual(validDoc().openQuestions)
    expect(llmClientModule.callStructuredModel).toHaveBeenCalledTimes(1)
  })

  it("sends every visible member's three dimension arrays to the LLM", async () => {
    vi.mocked(llmClientModule.callStructuredModel).mockResolvedValue(validDoc())

    await runThreadOpenQuestionsPass(MEMBERS)

    const [model, , userContent, callSite] = vi.mocked(llmClientModule.callStructuredModel).mock.calls[0]
    expect(model).toBe('gpt-4o')
    expect(callSite).toBe('threadOpenQuestions')
    const payload = JSON.parse(userContent) as unknown[]
    expect(payload).toHaveLength(2)
  })

  it('retries once and returns the repaired result when a dangling ref is fixed', async () => {
    vi.mocked(llmClientModule.callStructuredModel)
      .mockResolvedValueOnce(
        validDoc({
          openQuestions: [
            {
              question: 'x',
              detail: 'y',
              relatedItems: [{ analysisId: 'a1', dimensionItemId: 'd-missing' }],
            },
          ],
        })
      )
      .mockResolvedValueOnce(validDoc())

    const result = await runThreadOpenQuestionsPass(MEMBERS)

    expect(result).toEqual(validDoc().openQuestions)
    expect(llmClientModule.callStructuredModel).toHaveBeenCalledTimes(2)
  })

  it('falls back to an empty array, without throwing, when verification still fails after the retry', async () => {
    vi.mocked(llmClientModule.callStructuredModel).mockResolvedValue(
      validDoc({
        openQuestions: [
          { question: 'x', detail: 'y', relatedItems: [{ analysisId: 'a1', dimensionItemId: 'd-missing' }] },
        ],
      })
    )

    const result = await runThreadOpenQuestionsPass(MEMBERS)

    expect(result).toEqual([])
    expect(llmClientModule.callStructuredModel).toHaveBeenCalledTimes(2)
  })

  it('falls back to an empty array when the repair response does not match the schema', async () => {
    vi.mocked(llmClientModule.callStructuredModel)
      .mockResolvedValueOnce(
        validDoc({
          openQuestions: [
            {
              question: 'x',
              detail: 'y',
              relatedItems: [{ analysisId: 'a1', dimensionItemId: 'd-missing' }],
            },
          ],
        })
      )
      .mockResolvedValueOnce({ not: 'valid' })

    const result = await runThreadOpenQuestionsPass(MEMBERS)

    expect(result).toEqual([])
  })

  it('propagates a raw LLM call failure — not caught, since there is nothing to verify yet', async () => {
    vi.mocked(llmClientModule.callStructuredModel).mockRejectedValue(new Error('API down'))

    await expect(runThreadOpenQuestionsPass(MEMBERS)).rejects.toThrow('API down')
  })
})
