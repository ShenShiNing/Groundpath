import type { AppErrorCode } from '@knowledge-agent/shared/types';

/**
 * Base error class for all application errors.
 * Provides structured error info for consistent API responses.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string | AppErrorCode,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
    public readonly isOperational: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * Common error factory methods
 */
export const Errors = {
  // General errors
  notFound: (resource: string) => new AppError('NOT_FOUND', `${resource} not found`, 404),
  unauthorized: (msg = 'Authentication required') => new AppError('UNAUTHORIZED', msg, 401),
  forbidden: (msg = 'Access denied') => new AppError('ACCESS_DENIED', msg, 403),
  validation: (msg: string, details?: Record<string, unknown>) =>
    new AppError('VALIDATION_ERROR', msg, 400, details),
  conflict: (msg: string) => new AppError('CONFLICT', msg, 409),
  internal: (msg = 'An unexpected error occurred') =>
    new AppError('INTERNAL_ERROR', msg, 500, undefined, false),

  // Auth-specific errors (with typed error codes)
  auth: (
    code: AppErrorCode,
    message: string,
    statusCode = 401,
    details?: Record<string, unknown>
  ) => new AppError(code, message, statusCode, details),
};
