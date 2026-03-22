import { afterEach, describe, expect, it, vi } from 'vitest';

async function importValidatedEnvModule(options: {
  envDir?: string;
  nodeEnv?: string;
  safeParseResult:
    | { success: true; data: Record<string, unknown> }
    | {
        success: false;
        error: {
          flatten: () => {
            fieldErrors: Record<string, string[]>;
          };
        };
      };
}) {
  const { envDir = '/tmp/config', nodeEnv = 'test', safeParseResult } = options;

  vi.resetModules();

  vi.doMock('@config/env/loader', () => ({
    envDir,
    nodeEnv,
    isEnvLoaded: vi.fn(() => true),
  }));

  vi.doMock('@config/env/schema', () => ({
    envSchema: {
      safeParse: vi.fn(() => safeParseResult),
    },
  }));

  return import('@config/env/validated-env');
}

describe('shared/config/env/validated-env', () => {
  afterEach(() => {
    vi.doUnmock('@config/env/loader');
    vi.doUnmock('@config/env/schema');
    vi.resetModules();
  });

  it('should export validated env data when schema validation succeeds', async () => {
    const parsedEnv = {
      NODE_ENV: 'test',
      PORT: 3000,
      DATABASE_URL: 'mysql://example',
    };

    const module = await importValidatedEnvModule({
      safeParseResult: {
        success: true,
        data: parsedEnv,
      },
    });

    expect(module.validatedEnv).toEqual(parsedEnv);
    expect(module.env).toEqual(parsedEnv);
  });

  it('should throw AppError with env validation details when schema validation fails', async () => {
    const loadModule = () =>
      importValidatedEnvModule({
        envDir: '/workspace/config',
        nodeEnv: 'production',
        safeParseResult: {
          success: false,
          error: {
            flatten: () => ({
              fieldErrors: {
                DATABASE_URL: ['Required'],
                JWT_SECRET: ['String must contain at least 32 character(s)'],
              },
            }),
          },
        },
      });

    const actual = await loadModule().catch((error) => error);

    expect(actual).toMatchObject({
      name: 'AppError',
      code: 'VALIDATION_ERROR',
      message: 'Invalid environment variables',
      statusCode: 400,
      details: {
        environment: 'production',
        configDir: '/workspace/config',
        fieldErrors: {
          DATABASE_URL: ['Required'],
          JWT_SECRET: ['String must contain at least 32 character(s)'],
        },
      },
    });
  });

  it('should throw when production secrets still use known placeholder values', async () => {
    const loadModule = () =>
      importValidatedEnvModule({
        envDir: '/workspace/config',
        nodeEnv: 'production',
        safeParseResult: {
          success: true,
          data: {
            NODE_ENV: 'production',
            STORAGE_TYPE: 'local',
            EMBEDDING_PROVIDER: 'ollama',
            IMAGE_DESCRIPTION_ENABLED: false,
            JWT_SECRET: 'change-this-jwt-secret-at-least-32-characters',
            ENCRYPTION_KEY: 'change-this-encryption-key-at-least-32',
            EMAIL_VERIFICATION_SECRET: 'change-this-email-secret',
          },
        },
      });

    const actual = await loadModule().catch((error) => error);

    expect(actual).toMatchObject({
      name: 'AppError',
      code: 'VALIDATION_ERROR',
      details: {
        fieldErrors: {
          JWT_SECRET: ['JWT_SECRET must be replaced with a unique production secret.'],
          ENCRYPTION_KEY: ['ENCRYPTION_KEY must be replaced with a unique production secret.'],
          EMAIL_VERIFICATION_SECRET: [
            'EMAIL_VERIFICATION_SECRET must be replaced with a unique production secret.',
          ],
        },
      },
    });
  });

  it('should throw when the selected embedding provider is missing its required API key', async () => {
    const loadModule = () =>
      importValidatedEnvModule({
        envDir: '/workspace/config',
        nodeEnv: 'production',
        safeParseResult: {
          success: true,
          data: {
            NODE_ENV: 'production',
            STORAGE_TYPE: 'local',
            EMBEDDING_PROVIDER: 'zhipu',
            IMAGE_DESCRIPTION_ENABLED: false,
            JWT_SECRET: 'x'.repeat(32),
            ENCRYPTION_KEY: 'y'.repeat(32),
            EMAIL_VERIFICATION_SECRET: 'prod-email-verification-secret',
            ZHIPU_API_KEY: '',
          },
        },
      });

    const actual = await loadModule().catch((error) => error);

    expect(actual).toMatchObject({
      name: 'AppError',
      code: 'VALIDATION_ERROR',
      details: {
        fieldErrors: {
          ZHIPU_API_KEY: ['ZHIPU_API_KEY is required when EMBEDDING_PROVIDER=zhipu.'],
        },
      },
    });
  });
});
