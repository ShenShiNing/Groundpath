import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loginLogRepository: {
    list: vi.fn(),
    listByUser: vi.fn(),
  },
  operationLogRepository: {
    list: vi.fn(),
    listByResource: vi.fn(),
  },
}));

vi.mock('@modules/auth/public/login-logs', () => ({
  loginLogRepository: mocks.loginLogRepository,
}));

vi.mock('@modules/logs/repositories/operation-log.repository', () => ({
  operationLogRepository: mocks.operationLogRepository,
}));

import { loginLogService } from '@modules/logs/services/login-log.service';
import { operationLogService } from '@modules/logs/services/operation-log.service';

describe('log services > ip redaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('masks ip addresses in login log responses', async () => {
    mocks.loginLogRepository.list.mockResolvedValue({
      logs: [
        {
          id: 'login-1',
          authType: 'password',
          success: true,
          failureReason: null,
          ipAddress: '203.0.113.42',
          deviceType: 'desktop',
          browser: 'Chrome',
          os: 'Windows',
          country: 'US',
          countryName: 'United States',
          city: 'Seattle',
          createdAt: new Date('2026-04-05T00:00:00.000Z'),
        },
      ],
      total: 1,
    });

    const result = await loginLogService.list('user-1', {
      page: 1,
      pageSize: 20,
    });

    expect(result.logs[0]?.ipAddress).toBe('203.0.113.*');
  });

  it('masks ip addresses in operation log detail responses', async () => {
    mocks.operationLogRepository.listByResource.mockResolvedValue([
      {
        id: 'op-1',
        userId: 'user-1',
        resourceType: 'document',
        resourceId: 'doc-1',
        resourceName: 'Doc',
        action: 'delete',
        description: 'Deleted document',
        status: 'success',
        ipAddress: '2001:db8::1',
        oldValue: null,
        newValue: null,
        metadata: null,
        userAgent: 'Mozilla/5.0',
        errorMessage: null,
        durationMs: 15,
        createdAt: new Date('2026-04-05T00:00:00.000Z'),
      },
    ]);

    const result = await operationLogService.getResourceHistory('document', 'doc-1', 'user-1', 10);

    expect(result[0]?.ipAddress).toBe('2001:0db8:0000:*');
  });
});
