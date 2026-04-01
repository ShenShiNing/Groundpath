import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { AppError } from '@core/errors';
import { getClientIp, requireUserId } from '@core/utils/request.utils';

describe('request.utils > getClientIp', () => {
  it('should return req.ip when available', () => {
    const req = {
      ip: '203.0.113.10',
      socket: { remoteAddress: '127.0.0.1' },
    } as Request;

    expect(getClientIp(req)).toBe('203.0.113.10');
  });

  it('should fall back to socket.remoteAddress when req.ip is missing', () => {
    const req = {
      ip: undefined,
      socket: { remoteAddress: '127.0.0.1' },
    } as Request;

    expect(getClientIp(req)).toBe('127.0.0.1');
  });

  it('should return null when both req.ip and socket.remoteAddress are missing', () => {
    const req = {
      ip: undefined,
      socket: { remoteAddress: undefined },
    } as Request;

    expect(getClientIp(req)).toBeNull();
  });
});

describe('request.utils > requireUserId', () => {
  it('should return req.user.sub when authenticated', () => {
    const req = {
      user: { sub: 'user-123' },
    } as Request;

    expect(requireUserId(req)).toBe('user-123');
  });

  it('should throw UNAUTHORIZED when req.user.sub is missing', () => {
    const req = {} as Request;

    expect(() => requireUserId(req)).toThrow(AppError);

    try {
      requireUserId(req);
    } catch (error) {
      const appError = error as AppError;
      expect(appError.code).toBe('UNAUTHORIZED');
      expect(appError.statusCode).toBe(401);
    }
  });
});
