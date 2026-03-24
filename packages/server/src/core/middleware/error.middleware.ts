import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@core/errors/app-error';
import { sendErrorResponse } from '@core/errors/response';
import { logger } from '@core/logger';
import { serverConfig } from '@config/env';

/**
 * Global error handling middleware.
 * Must be registered after all routes.
 * Note: Express requires all 4 parameters to recognize this as an error handler.
 */
export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId;

  // Handle AppError (including Errors factory)
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, requestId, method: req.method, url: req.url }, err.message);
    } else {
      logger.warn({ err, requestId, method: req.method, url: req.url }, err.message);
    }

    sendErrorResponse(res, err.statusCode, err.code, err.message, {
      details: err.details,
      requestId,
    });
    return;
  }

  // Unknown errors - protect stack trace in production
  if (serverConfig.nodeEnv === 'production') {
    // Production: log only essential info without full stack trace
    logger.error(
      { requestId, method: req.method, url: req.url, errorMessage: err.message },
      'Unhandled error'
    );
  } else {
    // Development/test: log full error with stack trace
    logger.error({ err, requestId, method: req.method, url: req.url }, 'Unhandled error');
  }

  sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred', {
    requestId,
  });
}
