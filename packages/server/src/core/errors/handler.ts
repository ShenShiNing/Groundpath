import type { Response } from 'express';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import { HTTP_STATUS, ERROR_CODES } from '@knowledge-agent/shared';
import { ZodError } from '@knowledge-agent/shared/schemas';
import { logger } from '@core/logger';
import {
  localizeApiError,
  resolveServerLocale,
  translateErrorMessage,
} from '@core/i18n/error-translator';
import { translateZodIssue } from '@core/i18n/zod-error-translator';
import { AppError } from './app-error';
import { sendErrorResponse } from './response';

/**
 * Format Zod validation errors into a structured object
 */
function formatZodErrors(error: ZodError, res: Response): Record<string, string[]> {
  const locale = resolveServerLocale(res);
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'root';
    if (!details[path]) details[path] = [];
    details[path].push(translateZodIssue(issue, locale));
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
      error: localizeApiError(error, res),
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
        message: translateErrorMessage(
          'Validation failed',
          resolveServerLocale(res),
          ERROR_CODES.VALIDATION_ERROR
        ),
        details: formatZodErrors(error, res),
      },
    };
    res.status(HTTP_STATUS.BAD_REQUEST).json(response);
    return;
  }

  logger.error({ err: error, context }, 'Unhandled error');
  sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
}
