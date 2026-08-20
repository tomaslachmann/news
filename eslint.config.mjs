import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import eslintConfigPrettier from 'eslint-config-prettier'

export default defineConfig(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '.scratch/**',
      'packages/backend/prisma/migrations/**',
      'packages/frontend/src/components/ui/**',
      // Vanilla-JS static assets ported verbatim from news_design (ticket 39's /styleguide
      // route) — classic scripts served as-is, not part of the TS-checked app source.
      'packages/frontend/public/styleguide-assets/**',
    ],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.config.{js,mjs,cjs,ts}', '**/*.config.*.{js,mjs,cjs,ts}', 'scripts/**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['packages/frontend/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // Only repositories/ may talk to Prisma — see ADR 0010.
    files: ['packages/backend/**/*.ts'],
    ignores: ['packages/backend/src/repositories/**', 'packages/backend/src/db.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@prisma/client',
              message: 'Only repositories/ may import @prisma/client — see ADR 0010.',
            },
          ],
          patterns: [
            {
              group: ['*db.js', '**/db.js'],
              message: 'Only repositories/ may import db.ts — see ADR 0010.',
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier
)
