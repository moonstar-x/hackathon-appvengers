import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    projects: ['packages/*'],
    coverage: {
      provider: 'v8',
      include: [
        'packages/shared/src/**/*.ts',
        'packages/api/src/**/*.ts',
        'packages/ui/src/**/*.{ts,tsx}',
      ],
      exclude: ['**/server.ts', '**/lambda.ts', '**/main.tsx'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      thresholds: {
        'packages/shared/src/**': { lines: 90, branches: 90 },
        'packages/api/src/**': { lines: 80, branches: 80 },
        'packages/ui/src/**': { lines: 60, branches: 60 },
      },
    },
  },
});
