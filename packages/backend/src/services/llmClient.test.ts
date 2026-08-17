import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as llmCallLogRepo from '../repositories/llmCallLog.js'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: mockCreate } }
  },
}))
vi.mock('../repositories/llmCallLog.js')

import { callJsonModel } from './llmClient.js'

describe('callJsonModel', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    vi.mocked(llmCallLogRepo.recordLlmCallSafe).mockReset().mockResolvedValue(undefined)
  })

  it('sends the system/user messages and parses the JSON content of the first choice', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"foo":"bar"}' } }],
    })

    const result = await callJsonModel('gpt-4o', 'system prompt', 'user content', 'extraction')

    expect(result).toEqual({ foo: 'bar' })
    expect(mockCreate).toHaveBeenCalledWith({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'user content' },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    })
  })

  it('returns an empty object when the response has no message content', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: {} }] })

    const result = await callJsonModel('gpt-4o', 'system', 'user', 'extraction')

    expect(result).toEqual({})
  })

  it('passes a caller-supplied temperature through instead of the default', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: '{}' } }] })

    await callJsonModel('gpt-4o', 'system', 'user', 'keywordExtractor', 0.2)

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.2 }))
  })

  it('records a successful call with the request, response, and callSite', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: '{"foo":"bar"}' } }] })

    await callJsonModel('gpt-4o', 'system prompt', 'user content', 'synthesis')

    expect(llmCallLogRepo.recordLlmCallSafe).toHaveBeenCalledWith({
      callSite: 'synthesis',
      model: 'gpt-4o',
      systemPrompt: 'system prompt',
      userContent: 'user content',
      responseContent: '{"foo":"bar"}',
      error: null,
    })
  })

  it('records a failed call and still rethrows when the API call itself throws', async () => {
    mockCreate.mockRejectedValue(new Error('API down'))

    await expect(callJsonModel('gpt-4o', 'system', 'user', 'narrative')).rejects.toThrow('API down')

    expect(llmCallLogRepo.recordLlmCallSafe).toHaveBeenCalledWith({
      callSite: 'narrative',
      model: 'gpt-4o',
      systemPrompt: 'system',
      userContent: 'user',
      responseContent: null,
      error: 'API down',
    })
  })

  it('records the malformed content and still rethrows when the response is not valid JSON', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'not json' } }] })

    await expect(callJsonModel('gpt-4o', 'system', 'user', 'storyVerification')).rejects.toThrow()

    expect(llmCallLogRepo.recordLlmCallSafe).toHaveBeenCalledWith(
      expect.objectContaining({ callSite: 'storyVerification', responseContent: 'not json' })
    )
    const [recordedCall] = vi.mocked(llmCallLogRepo.recordLlmCallSafe).mock.calls[0] ?? []
    expect(typeof recordedCall?.error).toBe('string')
  })
})
