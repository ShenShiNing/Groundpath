import type { Server } from 'node:http';
import express, { type RequestHandler } from 'express';

/**
 * Shared E2E test helpers.
 *
 * These helpers mirror the patterns used in existing `*.http.test.ts` files
 * but are designed for multi-step journey tests where requests share state
 * (tokens, created IDs, etc.) across steps.
 */

/**
 * Create a passthrough middleware (no-op).
 */
export const passthrough: RequestHandler = (_req, _res, next) => next();

/**
 * Create an authenticate middleware that accepts 'Bearer valid-access'
 * and populates req.user with test user data.
 */
export function createAuthMiddleware(userId = 'user-1'): RequestHandler {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (
      typeof authHeader === 'string' &&
      authHeader.startsWith('Bearer ') &&
      authHeader.length > 7
    ) {
      req.user = {
        sub: userId,
        sid: 'sid-1',
        email: `${userId}@example.com`,
        username: userId,
        status: 'active' as const,
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
}

/**
 * Boot an Express app on a random port and return the baseUrl + server handle.
 */
export async function startTestServer(
  setupRoutes: (app: express.Express) => void
): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  setupRoutes(app);

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to get test server address');
  }

  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

/**
 * Close a test server gracefully.
 */
export async function stopTestServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

/**
 * JSON fetch helper – sends a request and parses the JSON body.
 */
export async function jsonFetch(
  url: string,
  options: RequestInit = {}
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(url, options);
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

/**
 * Authenticated JSON fetch – adds Bearer token header.
 */
export async function authFetch(
  url: string,
  token: string,
  options: RequestInit = {}
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers = {
    ...(options.headers as Record<string, string> | undefined),
    authorization: `Bearer ${token}`,
  };
  return jsonFetch(url, { ...options, headers });
}

/**
 * Authenticated JSON POST – sends JSON body with auth.
 */
export async function authPost(
  url: string,
  token: string,
  data: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  return authFetch(url, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
}

/**
 * Authenticated JSON PATCH – sends JSON body with auth.
 */
export async function authPatch(
  url: string,
  token: string,
  data: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  return authFetch(url, token, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
}

/**
 * Authenticated DELETE.
 */
export async function authDelete(
  url: string,
  token: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  return authFetch(url, token, { method: 'DELETE' });
}
