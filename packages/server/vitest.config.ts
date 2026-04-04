import path from 'path';
import { defineProject } from 'vitest/config';
import { loadEnv } from 'vite';

const repoRoot = path.resolve(__dirname, '../..');
const env = loadEnv('test', repoRoot, '');

export default defineProject({
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@modules': path.resolve(__dirname, 'src/modules'),
      '@config': path.resolve(__dirname, 'src/core/config'),
      '@tests': path.resolve(__dirname, 'tests'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        env.TEST_DATABASE_URL ?? env.DATABASE_URL ?? 'mysql://test:test@localhost:3306/test_db',
      REDIS_URL: env.TEST_REDIS_URL ?? env.REDIS_URL ?? 'redis://localhost:6379',
      REDIS_PREFIX: env.TEST_REDIS_PREFIX ?? env.REDIS_PREFIX ?? 'groundpath-test',
      JWT_SECRET: 'test-jwt-secret-at-least-32-characters-long',
      ENCRYPTION_KEY: 'test-encryption-key-at-least-32-chars',
      EMAIL_VERIFICATION_SECRET: 'test-email-verification-secret',
    },
  },
});
