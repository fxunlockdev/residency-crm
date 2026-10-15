import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    setupFiles: ['tests/setup-env.ts'],
    // Integration tests share one database, so they must not run concurrently.
    fileParallelism: false,
    coverage: { reporter: ['text', 'html'], include: ['src/lib/**'] },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      // `server-only` throws outside a React Server Component; stub it so the
      // server-side modules it guards can still be unit tested.
      'server-only': path.resolve(import.meta.dirname, 'tests/stubs/server-only.ts'),
    },
  },
});
