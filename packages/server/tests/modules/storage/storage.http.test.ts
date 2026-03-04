import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpTestBody } from '@tests/helpers/http';

const { verifySignatureMock, storageProviderMock } = vi.hoisted(() => ({
  verifySignatureMock: vi.fn(() => true),
  storageProviderMock: {
    getStream: vi.fn(async () => ({
      body: (async function* () {
        yield Buffer.from('hello-storage');
      })(),
      contentType: 'text/plain',
      contentLength: 13,
    })),
  },
}));

vi.mock('@config/env', async () => {
  const actual = await vi.importActual<typeof import('@config/env')>('@config/env');
  return {
    ...actual,
    serverConfig: {
      ...actual.serverConfig,
      nodeEnv: 'test',
    },
    storageConfig: {
      ...actual.storageConfig,
      signing: {
        ...actual.storageConfig.signing,
        disabled: false,
      },
    },
  };
});

vi.mock('@shared/utils', async () => {
  const actual = await vi.importActual<typeof import('@shared/utils')>('@shared/utils');
  return {
    ...actual,
    verifySignature: verifySignatureMock,
  };
});

vi.mock('@modules/storage/storage.factory', () => ({
  storageProvider: storageProviderMock,
}));

import { storageRoutes } from '@modules/storage/storage.routes';

describe('storage.routes http behavior', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = express();
    app.use('/storage', storageRoutes);
    app.use(
      (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        if (
          err &&
          typeof err === 'object' &&
          'code' in err &&
          'message' in err &&
          'statusCode' in err &&
          typeof (err as { statusCode?: unknown }).statusCode === 'number'
        ) {
          const appError = err as { code: string; message: string; statusCode: number };
          res.status(appError.statusCode).json({
            success: false,
            error: { code: appError.code, message: appError.message },
          });
          return;
        }

        res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
        });
      }
    );

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
    verifySignatureMock.mockReturnValue(true);
    storageProviderMock.getStream.mockResolvedValue({
      body: (async function* () {
        yield Buffer.from('hello-storage');
      })(),
      contentType: 'text/plain',
      contentLength: 13,
    });
  });

  it('should reject request when signature is missing', async () => {
    const response = await fetch(`${baseUrl}/storage/files/docs/a.txt`);
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
    expect(storageProviderMock.getStream).not.toHaveBeenCalled();
  });

  it('should reject request when expiration format is invalid', async () => {
    const response = await fetch(`${baseUrl}/storage/files/docs/a.txt?sig=ok&exp=abc`);
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
    expect(verifySignatureMock).not.toHaveBeenCalled();
  });

  it('should reject request when signature verification fails', async () => {
    verifySignatureMock.mockReturnValueOnce(false);

    const response = await fetch(`${baseUrl}/storage/files/docs/a.txt?sig=bad&exp=12345`);
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
    expect(storageProviderMock.getStream).not.toHaveBeenCalled();
  });

  it('should reject path traversal key', async () => {
    const response = await fetch(`${baseUrl}/storage/files/..%2Fsecret.txt?sig=ok&exp=12345`);
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(storageProviderMock.getStream).not.toHaveBeenCalled();
  });

  it('should reject invalid key encoding', async () => {
    const response = await fetch(`${baseUrl}/storage/files/%25E0%A4%A?sig=ok&exp=12345`);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(storageProviderMock.getStream).not.toHaveBeenCalled();
  });

  it('should return NOT_FOUND when storage provider reports ENOENT', async () => {
    storageProviderMock.getStream.mockRejectedValueOnce(
      Object.assign(new Error('File not found'), { code: 'ENOENT' })
    );

    const response = await fetch(`${baseUrl}/storage/files/docs/a.txt?sig=ok&exp=12345`);
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('should stream file content for valid signed request', async () => {
    const response = await fetch(`${baseUrl}/storage/files/docs/a.txt?sig=ok&exp=12345`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toBe('hello-storage');
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(response.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(storageProviderMock.getStream).toHaveBeenCalledWith('docs/a.txt');
  });
});
