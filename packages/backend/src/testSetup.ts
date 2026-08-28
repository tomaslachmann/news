import { vi } from 'vitest'

// Global for the whole unit suite (wired in via vitest.config.ts's `setupFiles`), not per-test-file
// vi.mock calls: llmClient.ts/embeddingClient.ts create a real, module-level `createLogger(...)`
// logger at import time (ticket 86) — without this, every test file that transitively imports
// either of them spins up logger.ts's real pino.multistream() sinks and rotating-file-stream file
// I/O as an unintended side effect of running `npm test`, not because any test actually exercises
// logging (code review finding, ticket 86).
const fakeLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: () => fakeLogger,
}

vi.mock('./logger.js', async (importOriginal) => ({
  // Spreads the real module first (logger.test.ts imports colorForNamespace directly and needs
  // the genuine implementation, not a mock) -- only createLogger itself is replaced.
  ...(await importOriginal<typeof import('./logger.js')>()),
  createLogger: vi.fn(() => fakeLogger),
}))
