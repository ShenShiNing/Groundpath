import type { Response } from 'express';
import { HTTP_STATUS } from '@knowledge-agent/shared';
import type { ApiResponse, AppErrorCode } from '@knowledge-agent/shared/types';
import { logger } from '@shared/logger';

/**
 * Custom error class for authentication errors
 */
export class AuthError extends Error {
  public readonly code: AppErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: AppErrorCode,
    message: string,
    statusCode: number = 401,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Check if an error is an AuthError
 */
export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

/**
 * Send a standardized error response
 */
export function sendErrorResponse(
  res: Response,
  statusCode: number,
  code: string,
  message: string
): void {
  const response: ApiResponse = {
    success: false,
    error: { code, message },
  };
  res.status(statusCode).json(response);
}

/**
 * Send a standardized success response
 */
export function sendSuccessResponse<T>(res: Response, data: T, statusCode: number = 200): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
  };
  res.status(statusCode).json(response);
}

/**
 * Handle errors and send appropriate response.
 * Shared between controller and middleware.
 */
export function handleError(error: unknown, res: Response, context: string): void {
  if (isAuthError(error)) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
    res.status(error.statusCode).json(response);
    return;
  }

  logger.error({ err: error, context }, 'Unhandled error');
  sendErrorResponse(
    res,
    HTTP_STATUS.INTERNAL_ERROR,
    'INTERNAL_ERROR',
    'An unexpected error occurred'
  );
}
