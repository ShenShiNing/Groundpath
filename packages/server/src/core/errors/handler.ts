import type { Response } from 'express';
import type { ApiResponse } from '@groundpath/shared/types';
import { HTTP_STATUS, ERROR_CODES } from '@groundpath/shared';
import { ZodError } from '@groundpath/shared/schemas';
import { logger } from '@core/logger';
import { AppError } from './app-error';
import { sendErrorResponse } from './response';

/**
 * Format Zod validation errors into a structured object
 */
function formatZodErrors(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'root';
    if (!details[path]) details[path] = [];
    details[path].push(issue.message);
  }
  return details;
}

/**
 * Handle errors and send appropriate response.
 * Shared between controller and middleware.
 */
export function handleError(error: unknown, res: Response, context: string): void {
  if (error instanceof AppError) {
    const response: ApiResponse = {
      success: false,
      error: error.toJSON(),
    };
    res.status(error.statusCode).json(response);
    return;
  }

  // Handle Zod validation errors as 400 Bad Request
  if (error instanceof ZodError) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Validation failed',
        details: formatZodErrors(error),
      },
    };
    res.status(HTTP_STATUS.BAD_REQUEST).json(response);
    return;
  }

  logger.error({ err: error, context }, 'Unhandled error');
  sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
}
