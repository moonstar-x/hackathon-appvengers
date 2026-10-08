import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({
  test: {
    name: 'ui',
    environment: 'jsdom',
    setupFiles: [resolve(import.meta.dirname, 'test/setup.ts')],
  },
});
