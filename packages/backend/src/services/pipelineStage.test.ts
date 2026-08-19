import { describe, it, expect, vi } from 'vitest'
import { runStageOrThrow } from './pipelineStage.js'
import { ExternalServiceError } from '../errors.js'

describe('runStageOrThrow', () => {
  it('returns the result when run succeeds', async () => {
    const result = await runStageOrThrow({ storyId: 'story-1' }, 'Some stage', undefined, () =>
      Promise.resolve('ok')
    )
    expect(result).toBe('ok')
  })

  it('logs with stage context and rethrows as ExternalServiceError with the original error as cause', async () => {
    const original = new Error('boom')
    const log = { error: vi.fn() }
    const run = () =>
      runStageOrThrow({ storyId: 'story-1' }, 'Some stage', log as never, () => Promise.reject(original))

    await expect(run()).rejects.toThrow(ExternalServiceError)
    await expect(run()).rejects.toThrow('Some stage failed (storyId=story-1)')

    const err = await run().catch((e: unknown) => e)
    expect((err as ExternalServiceError).cause).toBe(original)

    expect(log.error).toHaveBeenCalledWith({ storyId: 'story-1', err: original }, 'Some stage failed')
  })

  it('renders multiple logContext entries into the thrown message', async () => {
    const run = () =>
      runStageOrThrow({ analysisId: 'a1' }, 'Some stage', undefined, () => Promise.reject(new Error('boom')))

    await expect(run()).rejects.toThrow('Some stage failed (analysisId=a1)')
  })
})
