import { describe, expect, it } from 'vitest';
import { AuthError, isAuthError } from '@shared/errors/errors';

describe('AuthError', () => {
  it('should create an error with correct properties', () => {
    const error = new AuthError('INVALID_CREDENTIALS', 'Invalid email or password', 401);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AuthError);
    expect(error.name).toBe('AuthError');
    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(error.message).toBe('Invalid email or password');
    expect(error.statusCode).toBe(401);
  });

  it('should default statusCode to 401', () => {
    const error = new AuthError('INVALID_CREDENTIALS', 'Invalid credentials');
    expect(error.statusCode).toBe(401);
  });

  it('should include optional details', () => {
    const details = { field: 'email' };
    const error = new AuthError('INVALID_CREDENTIALS', 'Invalid', 400, details);
    expect(error.details).toEqual({ field: 'email' });
  });

  it('should serialize to JSON correctly', () => {
    const error = new AuthError('TOKEN_EXPIRED', 'Token expired', 401);
    const json = error.toJSON();

    expect(json).toEqual({
      code: 'TOKEN_EXPIRED',
      message: 'Token expired',
      details: undefined,
    });
  });
});

describe('isAuthError', () => {
  it('should return true for AuthError instances', () => {
    const error = new AuthError('INVALID_CREDENTIALS', 'test');
    expect(isAuthError(error)).toBe(true);
  });

  it('should return false for regular errors', () => {
    expect(isAuthError(new Error('test'))).toBe(false);
  });

  it('should return false for non-error values', () => {
    expect(isAuthError('string')).toBe(false);
    expect(isAuthError(null)).toBe(false);
    expect(isAuthError(undefined)).toBe(false);
  });
});
