import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import refresh from 'eslint-plugin-react-refresh';
import a11y from 'eslint-plugin-jsx-a11y';
import vitest from '@vitest/eslint-plugin';
import prettier from 'eslint-config-prettier';
export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/cdk.out/**', '**/coverage/**'] },
  js.configs.recommended,
  { files: ['**/*.mjs'], languageOptions: { globals: { process: 'readonly' } } },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      eqeqeq: 'error',
      'no-console': 'error',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
    },
  },
  { files: ['**/scripts/**', '**/bin/**', '**/server.ts'], rules: { 'no-console': 'off' } },
  {
    files: ['packages/ui/**/*.tsx'],
    plugins: { 'react-hooks': hooks, 'react-refresh': refresh, 'jsx-a11y': a11y },
    rules: {
      ...hooks.configs.recommended.rules,
      ...a11y.configs.recommended.rules,
      'jsx-a11y/label-has-associated-control': ['error', { depth: 3 }],
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    plugins: { vitest },
    rules: vitest.configs.recommended.rules,
  },
  prettier,
);
