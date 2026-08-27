import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    // See src/testSetup.ts — keeps llmClient.ts/embeddingClient.ts's module-level logger.ts
    // usage from spinning up a real pino transport (worker thread + file I/O) on every test run.
    setupFiles: ['./src/testSetup.ts'],
    // Modules like keywordExtractor.ts construct an OpenAI client at import time; tests always
    // mock the functions that actually call it, but the constructor itself still needs a value.
    env: { OPENAI_API_KEY: 'test-key' },
  },
})
