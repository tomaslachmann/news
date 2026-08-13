import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['./test/integration/globalSetup.ts'],
    passWithNoTests: true,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
