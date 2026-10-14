// Open ADMS lint config (ADR-257): type-aware TypeScript rules, formatting left to Prettier.
// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['**/dist/', '**/coverage/', 'packages/db/src/generated/']),
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // A NestJS module is a class that holds only its decorator (ADR-380).
    files: ['apps/api/**/*.ts'],
    rules: { '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }] },
  },
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
  },
  {
    // Strict equality everywhere (ASVS 5.0 15.3.5; ADR-514); `== null` alone is kept, the one
    // comparison that means "null or undefined" and juggles no other type.
    files: ['**/*.ts', '**/*.tsx', '**/*.js'],
    rules: { eqeqeq: ['error', 'always', { null: 'ignore' }] },
  },
  prettier,
);
