import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';
import type { HttpTestBody } from '@tests/helpers/http';

const { authenticateMock, userControllerMock, uploadControllerMock } = vi.hoisted(() => {
  const authenticate: RequestHandler = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const isAuthorized =
      (typeof authHeader === 'string' &&
        authHeader.replace(/^Bearer\s+/i, '') === 'valid-access') ||
      (Array.isArray(authHeader) &&
        authHeader.some((value) => value.replace(/^Bearer\s+/i, '') === 'valid-access'));

    if (isAuthorized) {
      req.user = {
        sub: 'user-1',
        sid: 'sid-1',
        email: 'user-1@example.com',
        username: 'user1',
        status: 'active',
        emailVerified: true,
      };
      next();
      return;
    }

    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid access token' },
    });
  };

  return {
    authenticateMock: vi.fn(authenticate),
    userControllerMock: {
      updateProfile: vi.fn((_req, res) =>
        res.status(200).json({ success: true, route: 'profile-updated' })
      ),
    },
    uploadControllerMock: {
      uploadAvatar: vi.fn((_req, res) =>
        res.status(200).json({ success: true, route: 'avatar-uploaded' })
      ),
    },
  };
});

vi.mock('@core/middleware', async () => {
  const actual = await vi.importActual<typeof import('@core/middleware')>('@core/middleware');
  return {
    ...actual,
    authenticate: authenticateMock,
  };
});

vi.mock('@modules/user/controllers/user.controller', () => ({
  userController: userControllerMock,
}));

vi.mock('@modules/document/controllers/upload.controller', () => ({
  uploadController: uploadControllerMock,
}));

import userRoutes from '@modules/user/user.routes';

describe('user.routes http behavior', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/user', userRoutes);

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

  it('should reject unauthenticated profile update request', async () => {
    const response = await fetch(`${baseUrl}/user/profile`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'new_name' }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(userControllerMock.updateProfile).not.toHaveBeenCalled();
  });

  it('should validate profile update body', async () => {
    const response = await fetch(`${baseUrl}/user/profile`, {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ username: 'bad name with spaces' }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(userControllerMock.updateProfile).not.toHaveBeenCalled();
  });

  it('should pass valid profile update to controller', async () => {
    const response = await fetch(`${baseUrl}/user/profile`, {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer valid-access',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'good_name_01',
        bio: 'updated bio',
      }),
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.route).toBe('profile-updated');
    expect(userControllerMock.updateProfile).toHaveBeenCalledTimes(1);
  });

  it('should reject oversized avatar upload', async () => {
    const oversizedContent = 'a'.repeat(2 * 1024 * 1024 + 1);
    const formData = new FormData();
    formData.set('avatar', new Blob([oversizedContent], { type: 'image/png' }), 'avatar.png');

    const response = await fetch(`${baseUrl}/user/avatar`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
      },
      body: formData,
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('FILE_TOO_LARGE');
    expect(uploadControllerMock.uploadAvatar).not.toHaveBeenCalled();
  });

  it('should pass valid avatar upload to controller', async () => {
    const formData = new FormData();
    formData.set('avatar', new Blob(['ok'], { type: 'image/png' }), 'avatar.png');

    const response = await fetch(`${baseUrl}/user/avatar`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access',
      },
      body: formData,
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.route).toBe('avatar-uploaded');
    expect(uploadControllerMock.uploadAvatar).toHaveBeenCalledTimes(1);
  });
});
