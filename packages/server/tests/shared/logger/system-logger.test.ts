import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repository: {
    create: vi.fn(),
  },
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@modules/logs/public/repositories', () => ({
  systemLogRepository: mocks.repository,
}));

vi.mock('@core/logger', async () => {
  const actual = await vi.importActual<typeof import('@core/logger')>('@core/logger');
  return {
    ...actual,
    createLogger: () => mocks.logger,
  };
});

import { systemLogger } from '@core/logger/system-logger';

describe('systemLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repository.create.mockResolvedValue(undefined);
  });

  it('sanitizes pii in metadata before persistence', () => {
    const query = 'reset my password with token 123';
    const response = 'very secret document body';

    systemLogger.securityEvent('auth.test', 'Test security event', {
      email: 'alice@example.com',
      ipAddress: '203.0.113.42',
      userAgent: 'Mozilla/5.0',
      query,
      nested: {
        response,
      },
    });

    expect(mocks.repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          email: 'al***@ex***.com',
          ipAddress: expect.stringMatching(/^ip_[a-f0-9]{12}$/),
          userAgent: '[REDACTED]',
          query: {
            length: query.length,
            fingerprint: expect.any(String),
          },
          nested: {
            response: {
              length: response.length,
              fingerprint: expect.any(String),
            },
          },
        }),
      })
    );

    const metadata = mocks.repository.create.mock.calls[0]?.[0]?.metadata;
    expect(JSON.stringify(metadata)).not.toContain('alice@example.com');
    expect(JSON.stringify(metadata)).not.toContain('203.0.113.42');
    expect(JSON.stringify(metadata)).not.toContain('very secret document body');
  });
});
