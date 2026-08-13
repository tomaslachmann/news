import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    // Modules like keywordExtractor.ts construct an OpenAI client at import time; tests always
    // mock the functions that actually call it, but the constructor itself still needs a value.
    env: { OPENAI_API_KEY: 'test-key' },
  },
})
