import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';
import type { HttpTestBody } from '@tests/helpers/http';

const { emailSendRateLimiterMock, emailVerifyRateLimiterMock, emailControllerMock } = vi.hoisted(
  () => {
    const emailSendRateLimiter: RequestHandler = (req, res, next) => {
      if (req.headers['x-test-rate-limit'] === 'send') {
        res.status(429).json({
          success: false,
          error: { code: 'TOO_MANY_REQUESTS', message: 'Too many send-code attempts' },
        });
        return;
      }
      next();
    };

    const emailVerifyRateLimiter: RequestHandler = (req, res, next) => {
      if (req.headers['x-test-rate-limit'] === 'verify') {
        res.status(429).json({
          success: false,
          error: { code: 'TOO_MANY_REQUESTS', message: 'Too many verify-code attempts' },
        });
        return;
      }
      next();
    };

    return {
      emailSendRateLimiterMock: vi.fn(emailSendRateLimiter),
      emailVerifyRateLimiterMock: vi.fn(emailVerifyRateLimiter),
      emailControllerMock: {
        sendCode: vi.fn((_req, res) => res.status(200).json({ success: true, route: 'send-code' })),
        verifyCode: vi.fn((_req, res) =>
          res.status(200).json({ success: true, route: 'verify-code' })
        ),
      },
    };
  }
);

vi.mock('@shared/middleware', async () => {
  const actual = await vi.importActual<typeof import('@shared/middleware')>('@shared/middleware');
  return {
    ...actual,
    emailSendRateLimiter: emailSendRateLimiterMock,
    emailVerifyRateLimiter: emailVerifyRateLimiterMock,
  };
});

vi.mock('@modules/auth/verification/email.controller', () => ({
  emailController: emailControllerMock,
}));

import emailRoutes from '@modules/auth/verification/email.routes';

describe('email.routes http behavior', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/email', emailRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to get test server address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should validate send-code payload', async () => {
    const response = await fetch(`${baseUrl}/email/send-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'invalid-email',
        type: 'register',
      }),
    });
    const body: HttpTestBody = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(emailControllerMock.sendCode).not.toHaveBeenCalled();
  });

  it('should reject send-code when rate limited', async () => {
    const response = await fetch(`${baseUrl}/email/send-code`, {
      method: 'POST',
      headers: {
        'x-test-rate-limit': 'send',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'user@example.com',
        type: 'register',
      }),
    });
    const body: HttpTestBody = await response.json();

    expect(response.status).toBe(429);
    expect(body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(emailControllerMock.sendCode).not.toHaveBeenCalled();
  });

  it('should pass valid send-code request to controller', async () => {
    const response = await fetch(`${baseUrl}/email/send-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        type: 'reset_password',
      }),
    });
    const body: HttpTestBody = await response.json();

    expect(response.status).toBe(200);
    expect(body.route).toBe('send-code');
    expect(emailControllerMock.sendCode).toHaveBeenCalledTimes(1);
  });

  it('should validate verify-code payload with non-digit code', async () => {
    const response = await fetch(`${baseUrl}/email/verify-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        code: '12ab56',
        type: 'register',
      }),
    });
    const body: HttpTestBody = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(emailControllerMock.verifyCode).not.toHaveBeenCalled();
  });

  it('should reject verify-code when rate limited', async () => {
    const response = await fetch(`${baseUrl}/email/verify-code`, {
      method: 'POST',
      headers: {
        'x-test-rate-limit': 'verify',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'user@example.com',
        code: '123456',
        type: 'register',
      }),
    });
    const body: HttpTestBody = await response.json();

    expect(response.status).toBe(429);
    expect(body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(emailControllerMock.verifyCode).not.toHaveBeenCalled();
  });

  it('should pass valid verify-code request to controller', async () => {
    const response = await fetch(`${baseUrl}/email/verify-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        code: '123456',
        type: 'register',
      }),
    });
    const body: HttpTestBody = await response.json();

    expect(response.status).toBe(200);
    expect(body.route).toBe('verify-code');
    expect(emailControllerMock.verifyCode).toHaveBeenCalledTimes(1);
  });
});
