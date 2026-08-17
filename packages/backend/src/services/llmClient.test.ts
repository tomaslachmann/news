import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: mockCreate } }
  },
}))

import { callJsonModel } from './llmClient.js'

describe('callJsonModel', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('sends the system/user messages and parses the JSON content of the first choice', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"foo":"bar"}' } }],
    })

    const result = await callJsonModel('gpt-4o', 'system prompt', 'user content')

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

    const result = await callJsonModel('gpt-4o', 'system', 'user')

    expect(result).toEqual({})
  })

  it('passes a caller-supplied temperature through instead of the default', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: '{}' } }] })

    await callJsonModel('gpt-4o', 'system', 'user', 0.2)

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.2 }))
  })
})
