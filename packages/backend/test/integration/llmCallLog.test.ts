import { describe, it, expect, afterAll } from 'vitest'
import { recordLlmCall } from '../../src/repositories/llmCallLog.js'
import { disconnect } from '../../src/repositories/analysis.js'

describe('LlmCallLog repository against a real Postgres instance', () => {
  afterAll(async () => {
    await disconnect()
  })

  it('persists a successful call and reads it back', async () => {
    const created = await recordLlmCall({
      callSite: 'extraction',
      model: 'gpt-4o',
      systemPrompt: 'system prompt',
      userContent: 'user content',
      responseContent: '{"foo":"bar"}',
      error: null,
    })

    expect(created.id).toBeTruthy()
    expect(created.callSite).toBe('extraction')
    expect(created.model).toBe('gpt-4o')
    expect(created.systemPrompt).toBe('system prompt')
    expect(created.userContent).toBe('user content')
    expect(created.responseContent).toBe('{"foo":"bar"}')
    expect(created.error).toBeNull()
    expect(created.createdAt).toBeInstanceOf(Date)
  })

  it('persists a failed call with a null response and a non-null error', async () => {
    const created = await recordLlmCall({
      callSite: 'synthesis',
      model: 'gpt-4o',
      systemPrompt: 'system prompt',
      userContent: 'user content',
      responseContent: null,
      error: 'API down',
    })

    expect(created.responseContent).toBeNull()
    expect(created.error).toBe('API down')
  })
})
