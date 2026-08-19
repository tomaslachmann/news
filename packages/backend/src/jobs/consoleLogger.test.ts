import { describe, it, expect, vi, afterEach } from 'vitest'
import { makeConsoleLogger } from './consoleLogger.js'

describe('makeConsoleLogger', () => {
  afterEach(() => vi.restoreAllMocks())

  // Regression guard: workerLog previously implemented only warn/error. `log?.info(...)` only
  // short-circuits when `log` itself is nullish, not when a method on it is missing — so a real
  // call site logging at any other level (confirmStoryRelation calls log?.info, storyRelationPass.ts)
  // threw inside the job handler and was silently swallowed by linkStoryRelations' own
  // per-candidate catch, dropping every confirmed StoryRelation with no visible error anywhere.
  it.each(['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const)(
    'implements .%s without throwing',
    (level) => {
      const logger = makeConsoleLogger()
      expect(() => logger[level]({ some: 'context' }, 'a message')).not.toThrow()
    }
  )

  it('implements .silent as a no-op and .child returning a logger with the same levels', () => {
    const logger = makeConsoleLogger()
    expect(() => logger.silent({}, 'ignored')).not.toThrow()
    const child = logger.child({})
    expect(() => child.info({}, 'from child')).not.toThrow()
  })

  it('routes .error to console.error with the message first and context second', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = makeConsoleLogger()

    logger.error({ storyId: 's1' }, 'extraction failed')

    expect(errorSpy).toHaveBeenCalledWith('extraction failed', { storyId: 's1' })
  })
})
