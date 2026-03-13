import { describe, expect, it } from 'vitest';
import { AppError, Errors } from '@core/errors';

describe('AppError', () => {
  it('should create an error with correct properties', () => {
    const error = new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe('AppError');
    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(error.message).toBe('Invalid email or password');
    expect(error.statusCode).toBe(401);
  });

  it('should default statusCode to 500', () => {
    const error = new AppError('INTERNAL_ERROR', 'Something went wrong');
    expect(error.statusCode).toBe(500);
  });

  it('should include optional details', () => {
    const details = { field: 'email' };
    const error = new AppError('VALIDATION_ERROR', 'Invalid', 400, details);
    expect(error.details).toEqual({ field: 'email' });
  });

  it('should serialize to JSON correctly', () => {
    const error = new AppError('TOKEN_EXPIRED', 'Token expired', 401);
    const json = error.toJSON();

    expect(json).toEqual({
      code: 'TOKEN_EXPIRED',
      message: 'Token expired',
    });
  });

  it('should include details in JSON when present', () => {
    const error = new AppError('VALIDATION_ERROR', 'Invalid', 400, { field: 'email' });
    const json = error.toJSON();

    expect(json).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Invalid',
      details: { field: 'email' },
    });
  });
});

describe('Errors factory', () => {
  it('should create notFound error', () => {
    const error = Errors.notFound('User');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('User not found');
    expect(error.statusCode).toBe(404);
  });

  it('should create unauthorized error', () => {
    const error = Errors.unauthorized();
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.message).toBe('Authentication required');
    expect(error.statusCode).toBe(401);
  });

  it('should create forbidden error', () => {
    const error = Errors.forbidden();
    expect(error.code).toBe('ACCESS_DENIED');
    expect(error.message).toBe('Access denied');
    expect(error.statusCode).toBe(403);
  });

  it('should create validation error with details', () => {
    const error = Errors.validation('Invalid input', { field: 'email' });
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('Invalid input');
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual({ field: 'email' });
  });

  it('should create auth error with custom code', () => {
    const error = Errors.auth('TOKEN_EXPIRED', 'Token has expired', 401);
    expect(error.code).toBe('TOKEN_EXPIRED');
    expect(error.message).toBe('Token has expired');
    expect(error.statusCode).toBe(401);
  });
});

describe('instanceof checks', () => {
  it('should return true for AppError instances', () => {
    const error = new AppError('INVALID_CREDENTIALS', 'test');
    expect(error instanceof AppError).toBe(true);
  });

  it('should return true for Errors.auth() instances', () => {
    const error = Errors.auth('TOKEN_INVALID', 'test');
    expect(error instanceof AppError).toBe(true);
  });

  it('should return false for regular errors', () => {
    expect(new Error('test') instanceof AppError).toBe(false);
  });
});
