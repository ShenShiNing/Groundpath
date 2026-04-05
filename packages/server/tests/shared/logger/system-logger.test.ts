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

  it('sanitizes ip metadata before persistence', () => {
    systemLogger.securityEvent('auth.test', 'Test security event', {
      ipAddress: '203.0.113.42',
      nested: {
        ip: '2001:db8::1',
      },
    });

    expect(mocks.repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          ipAddress: '203.0.113.*',
          nested: {
            ip: '2001:0db8:0000:*',
          },
        },
      })
    );

    const metadata = mocks.repository.create.mock.calls[0]?.[0]?.metadata;
    expect(JSON.stringify(metadata)).not.toContain('203.0.113.42');
    expect(JSON.stringify(metadata)).not.toContain('2001:db8::1');
  });
});
