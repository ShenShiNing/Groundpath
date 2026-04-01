import { afterEach, describe, expect, it } from 'vitest';
import { resolveRealIntegrationEnvValue } from './real-integration';

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, originalEnv);
});

describe('resolveRealIntegrationEnvValue', () => {
  it('prefers dedicated process env values over shared and file-based fallbacks', () => {
    process.env.LOG_PARTITION_MIGRATIONS_REAL_DATABASE_URL = 'mysql://dedicated-process';
    process.env.DATABASE_URL = 'mysql://shared-process';

    const value = resolveRealIntegrationEnvValue(
      ['LOG_PARTITION_MIGRATIONS_REAL_DATABASE_URL', 'DATABASE_URL'],
      {
        LOG_PARTITION_MIGRATIONS_REAL_DATABASE_URL: 'mysql://dedicated-file',
        DATABASE_URL: 'mysql://shared-file',
      }
    );

    expect(value).toBe('mysql://dedicated-process');
  });

  it('falls back to shared process env values when dedicated ones are absent', () => {
    delete process.env.MESSAGES_SCHEMA_MIGRATIONS_REAL_DATABASE_URL;
    process.env.TEST_DATABASE_URL = 'mysql://shared-process-test-db';

    const value = resolveRealIntegrationEnvValue(
      ['MESSAGES_SCHEMA_MIGRATIONS_REAL_DATABASE_URL', 'TEST_DATABASE_URL', 'DATABASE_URL'],
      {
        DATABASE_URL: 'mysql://shared-file-db',
      }
    );

    expect(value).toBe('mysql://shared-process-test-db');
  });

  it('falls back to file values when no matching process env is present', () => {
    delete process.env.AUTH_SCHEMA_MIGRATIONS_REAL_DATABASE_URL;
    delete process.env.TEST_DATABASE_URL;
    delete process.env.DATABASE_URL;

    const value = resolveRealIntegrationEnvValue(
      ['AUTH_SCHEMA_MIGRATIONS_REAL_DATABASE_URL', 'TEST_DATABASE_URL', 'DATABASE_URL'],
      {
        DATABASE_URL: 'mysql://shared-file-db',
      }
    );

    expect(value).toBe('mysql://shared-file-db');
  });
});
