import { describe, expect, it } from 'vitest';
import type { Request, RequestHandler, Response } from 'express';
import { AppError } from '@core/errors/app-error';
import { requireResourceOwnership } from '@core/middleware/resource-ownership.middleware';

function createRequest(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    body: {},
    query: {},
    user: {
      sub: 'user-1',
      sid: 'sid-1',
      email: 'user@example.com',
      username: 'user1',
      status: 'active',
      emailVerified: true,
    },
    ...overrides,
  } as Request;
}

function createResponse(overrides: Partial<Response> = {}): Response {
  return {
    locals: {},
    ...overrides,
  } as Response;
}

async function runMiddleware(
  middleware: RequestHandler,
  req: Request,
  res: Response
): Promise<unknown> {
  return new Promise((resolve) => {
    middleware(req, res, (err?: unknown) => resolve(err));
  });
}

describe('requireResourceOwnership', () => {
  it('stores the resolved resource in res.locals and continues', async () => {
    const middleware = requireResourceOwnership({
      resourceKey: 'document',
      resolveResourceId: (req) => req.params.documentId,
      resolveOwnedResource: async ({ resourceId, userId }) => ({
        id: resourceId,
        userId,
      }),
    });
    const req = createRequest({ params: { documentId: 'doc-1' } });
    const res = createResponse();

    const error = await runMiddleware(middleware, req, res);

    expect(error).toBeUndefined();
    expect(res.locals.ownedResources?.document).toEqual({
      id: 'doc-1',
      userId: 'user-1',
    });
  });

  it('forwards validation errors when resource id is missing', async () => {
    const middleware = requireResourceOwnership({
      missingResourceMessage: 'Document ID required',
      resolveResourceId: () => undefined,
      resolveOwnedResource: async () => ({ id: 'doc-1' }),
    });

    const error = (await runMiddleware(middleware, createRequest(), createResponse())) as AppError;

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('Document ID required');
  });

  it('forwards unauthorized errors when request has no authenticated user', async () => {
    const middleware = requireResourceOwnership({
      resolveResourceId: () => 'doc-1',
      resolveOwnedResource: async () => ({ id: 'doc-1' }),
    });

    const error = (await runMiddleware(
      middleware,
      createRequest({ user: undefined }),
      createResponse()
    )) as AppError;

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('forwards resolver errors without swallowing them', async () => {
    const expected = new AppError('NOT_FOUND', 'Document not found', 404);
    const middleware = requireResourceOwnership({
      resolveResourceId: () => 'doc-1',
      resolveOwnedResource: async () => {
        throw expected;
      },
    });

    const error = await runMiddleware(middleware, createRequest(), createResponse());

    expect(error).toBe(expected);
  });
});
