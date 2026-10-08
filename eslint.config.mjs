// ESLint 9 flat config for the whole monorepo.
import expoConfig from 'eslint-config-expo/flat.js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/.expo/**',
    '**/.vercel/**',
    '**/coverage/**',
    'apps/api/src/generated/**',
    'apps/mobile/src/graphql/generated/**',
    'apps/mobile/expo-env.d.ts',
  ]),
  // Expo's config covers JS/TS, React, hooks and import rules (it bundles the
  // TypeScript parser and @typescript-eslint plugin).
  ...expoConfig,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    // Server / tooling code runs on Node.
    files: ['apps/api/**/*.{ts,js}', 'packages/shared/**/*.ts', 'scripts/**/*.{js,mjs}', '**/*.config.{js,mjs,ts}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'import/no-unresolved': 'off',
      // Not React code: Yoga/Envelop plugins are also named use*().
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  {
    files: ['**/test/**/*.ts', '**/__tests__/**/*.{ts,tsx}', 'apps/mobile/jest.setup.ts'],
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  prettier,
]);
