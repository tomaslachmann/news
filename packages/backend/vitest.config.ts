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
    // The *_MODEL pins keep the pass tests deterministic regardless of a dev's local `.env`
    // (which vitest otherwise loads on top) — several assert the exact model id passed to the LLM
    // client against these same `?? 'gpt-4o'` defaults.
    env: {
      OPENAI_API_KEY: 'test-key',
      EXTRACTION_MODEL: 'gpt-4o',
      SYNTHESIS_MODEL: 'gpt-4o',
      ENTITY_MODEL: 'gpt-4o',
      EMBEDDING_MODEL: 'text-embedding-3-small',
    },
  },
})
