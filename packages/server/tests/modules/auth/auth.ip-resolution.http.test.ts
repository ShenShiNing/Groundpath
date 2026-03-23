import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginRequestSchema } from '@groundpath/shared/schemas';
import type { AuthResponse } from '@groundpath/shared/types';
import { validateBody } from '@core/middleware/validation.middleware';

const { authServiceMock } = vi.hoisted(() => ({
  authServiceMock: {
    login: vi.fn(),
  },
}));

vi.mock('@modules/auth/services/auth.service', () => ({
  authService: authServiceMock,
}));

vi.mock('@modules/auth/services/session.service', () => ({
  sessionService: {},
}));

vi.mock('@modules/auth/services/password.service', () => ({
  passwordService: {},
}));

import { authController } from '@modules/auth/controllers/auth.controller';

const mockAuthResponse: AuthResponse = {
  user: {
    id: 'user-123',
    username: 'tester',
    email: 'test@example.com',
    avatarUrl: null,
    bio: null,
    status: 'active',
    emailVerified: true,
    createdAt: new Date('2026-03-23T00:00:00.000Z'),
  },
  tokens: {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 900,
    refreshExpiresIn: 604800,
  },
};

async function startLoginServer(trustProxy: boolean): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  app.set('trust proxy', trustProxy);
  app.use(express.json());
  app.post('/auth/login', validateBody(loginRequestSchema), authController.login);

  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to get test server address');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

describe('auth login http > ip resolution', () => {
  const loginBody = {
    email: 'test@example.com',
    password: 'SecurePass123',
  };
  const userAgent = 'ip-resolution-test';
  let servers: Server[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    authServiceMock.login.mockResolvedValue(mockAuthResponse);
  });

  afterEach(async () => {
    await Promise.all(servers.map((server) => stopServer(server)));
    servers = [];
  });

  it('should pass the left-most forwarded IP to authService.login when trust proxy is enabled', async () => {
    const { server, baseUrl } = await startLoginServer(true);
    servers.push(server);

    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': userAgent,
        'x-forwarded-for': '203.0.113.10, 10.0.0.2',
      },
      body: JSON.stringify(loginBody),
    });

    expect(response.status).toBe(200);
    expect(authServiceMock.login).toHaveBeenCalledWith(
      loginBody,
      '203.0.113.10',
      userAgent
    );
  });

  it('should ignore X-Forwarded-For when trust proxy is disabled', async () => {
    const { server, baseUrl } = await startLoginServer(false);
    servers.push(server);

    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': userAgent,
        'x-forwarded-for': '203.0.113.10, 10.0.0.2',
      },
      body: JSON.stringify(loginBody),
    });

    expect(response.status).toBe(200);

    const [, ipAddress, calledUserAgent] = authServiceMock.login.mock.calls[0] ?? [];

    expect(ipAddress).not.toBe('203.0.113.10');
    expect(ipAddress).toMatch(/^(::ffff:)?127\.0\.0\.1$|^::1$/);
    expect(calledUserAgent).toBe(userAgent);
  });
});
