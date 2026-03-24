import type { Response } from 'express';
import { HTTP_STATUS, ERROR_CODES } from '@groundpath/shared';
import { ZodError } from '@groundpath/shared/schemas';
import { logger } from '@core/logger';
import { AppError } from './app-error';
import { formatZodErrorDetails, sendErrorResponse } from './response';

/**
 * Handle errors and send appropriate response.
 * Shared between controller and middleware.
 */
export function handleError(error: unknown, res: Response, context: string): void {
  if (error instanceof AppError) {
    sendErrorResponse(res, error.statusCode, error.code, error.message, {
      details: error.details,
    });
    return;
  }

  // Handle Zod validation errors as 400 Bad Request
  if (error instanceof ZodError) {
    sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.VALIDATION_ERROR,
      'Validation failed',
      {
        details: formatZodErrorDetails(error),
      }
    );
    return;
  }

  logger.error({ err: error, context }, 'Unhandled error');
  sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
}
