import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@playwatch/config': resolve(__dirname, 'packages/config/src/index.ts'),
      '@playwatch/db': resolve(__dirname, 'packages/db/src/index.ts'),
      '@playwatch/storage': resolve(__dirname, 'packages/storage/src/index.ts'),
      '@playwatch/shared': resolve(__dirname, 'packages/shared/src/index.ts')
    }
  },
  test: {
    include: ['apps/**/*.test.{ts,tsx}', 'packages/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['apps/web/src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
      exclude: [
        '**/*.d.ts',
        '**/dist/**',
        'apps/web/src/test/**'
      ]
    }
  }
});
