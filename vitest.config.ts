import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/server', 'packages/shared'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/server/src/**/*.ts', 'packages/shared/src/**/*.ts'],
      exclude: [
        'packages/*/src/**/*.d.ts',
        'packages/*/src/test/**',
        'packages/server/src/index.ts',
        'packages/server/src/db/schema/**',
      ],
    },
  },
});
