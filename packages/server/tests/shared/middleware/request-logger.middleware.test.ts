import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  requestLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@core/logger', async () => {
  const actual = await vi.importActual<typeof import('@core/logger')>('@core/logger');
  return {
    ...actual,
    createRequestLogger: () => mocks.requestLogger,
  };
});

import { requestLoggerMiddleware } from '@core/middleware/request-logger.middleware';

describe('requestLoggerMiddleware', () => {
  it('logs sanitized paths without oauth query secrets', () => {
    const listeners: Record<string, () => void> = {};
    const req = {
      method: 'GET',
      requestId: 'req-1',
      originalUrl: '/api/v1/auth/oauth/github/callback?code=secret-code&state=opaque-state',
      url: '/api/v1/auth/oauth/github/callback?code=secret-code&state=opaque-state',
    } as unknown as Request;

    const res = {
      statusCode: 200,
      on: vi.fn((event: string, handler: () => void) => {
        listeners[event] = handler;
        return res;
      }),
    } as unknown as Response;

    requestLoggerMiddleware(req, res, vi.fn());
    listeners.finish?.();

    expect(mocks.requestLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/auth/oauth/github/callback',
        statusCode: 200,
      }),
      'Request completed'
    );

    const loggedPayload = mocks.requestLogger.info.mock.calls[0]?.[0];
    expect(JSON.stringify(loggedPayload)).not.toContain('secret-code');
    expect(JSON.stringify(loggedPayload)).not.toContain('opaque-state');
  });
});
