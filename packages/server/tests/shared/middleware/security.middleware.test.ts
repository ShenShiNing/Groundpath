import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { requireCsrfProtection } from '@core/middleware/security.middleware';
import { CSRF_TOKEN_COOKIE_NAME } from '@core/utils/cookie.utils';

function createResponseMock(): Response {
  const status = vi.fn();
  const json = vi.fn();
  const res = { status, json } as unknown as Response;
  status.mockReturnValue(res);
  return res;
}

describe('requireCsrfProtection', () => {
  it('should pass when origin and csrf tokens are valid', () => {
    const csrfToken = 'csrf-valid-token';
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'x-csrf-token': csrfToken,
      },
      cookies: {
        [CSRF_TOKEN_COOKIE_NAME]: csrfToken,
      },
    } as unknown as Request;
    const res = createResponseMock();
    const next = vi.fn();

    requireCsrfProtection(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should reject when csrf header is missing', () => {
    const req = {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
      },
      cookies: {
        [CSRF_TOKEN_COOKIE_NAME]: 'csrf-valid-token',
      },
    } as unknown as Request;
    const res = createResponseMock();
    const next = vi.fn();

    requireCsrfProtection(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should reject when request origin is not allowed', () => {
    const req = {
      method: 'POST',
      headers: {
        origin: 'https://evil.example.com',
        'x-csrf-token': 'csrf-valid-token',
      },
      cookies: {
        [CSRF_TOKEN_COOKIE_NAME]: 'csrf-valid-token',
      },
    } as unknown as Request;
    const res = createResponseMock();
    const next = vi.fn();

    requireCsrfProtection(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should bypass validation for GET requests', () => {
    const req = {
      method: 'GET',
      headers: {},
      cookies: {},
    } as unknown as Request;
    const res = createResponseMock();
    const next = vi.fn();

    requireCsrfProtection(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
