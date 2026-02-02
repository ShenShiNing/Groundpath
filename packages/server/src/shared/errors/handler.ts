import type { Response } from 'express';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import { logger } from '@shared/logger';
import { AppError } from './app-error';
import { sendErrorResponse } from './response';

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

  logger.error({ err: error, context }, 'Unhandled error');
  sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
}
