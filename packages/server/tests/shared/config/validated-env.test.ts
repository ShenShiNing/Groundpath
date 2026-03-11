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
});
