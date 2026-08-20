import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as llmClientModule from './llmClient.js'
import { runThreadTitlePass } from './threadTitlePass.js'

vi.mock('./llmClient.js')

describe('runThreadTitlePass', () => {
  beforeEach(() => vi.resetAllMocks())

  it("sends every member's flattened Agreement prose to the LLM, tagged with the threadTitle callSite, and returns the title", async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({ title: 'Vyšetřování kauzy X' })

    const result = await runThreadTitlePass([['Fakt A1', 'Fakt A2'], ['Fakt B1']])

    expect(result).toBe('Vyšetřování kauzy X')
    const [model, systemPrompt, userContent, callSite] = vi.mocked(llmClientModule.callJsonModel).mock
      .calls[0]
    expect(typeof model).toBe('string')
    expect(typeof systemPrompt).toBe('string')
    expect(callSite).toBe('threadTitle')
    expect(JSON.parse(userContent)).toEqual([['Fakt A1', 'Fakt A2'], ['Fakt B1']])
  })

  it('propagates a thrown error rather than swallowing it — the caller (threadRecomputeJob.ts) owns the fallback', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockRejectedValue(new Error('LLM down'))

    await expect(runThreadTitlePass([['x']])).rejects.toThrow('LLM down')
  })

  it('throws when the model returns an empty title', async () => {
    vi.mocked(llmClientModule.callJsonModel).mockResolvedValue({ title: '' })

    await expect(runThreadTitlePass([['x']])).rejects.toThrow()
  })
})
