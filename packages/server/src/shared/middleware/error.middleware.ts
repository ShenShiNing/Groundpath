import type { Request, Response } from 'express';
import { AppError } from '@shared/errors/app-error';
import { AuthError } from '@shared/errors/errors';
import { logger } from '@shared/logger';

/**
 * Global error handling middleware.
 * Must be registered after all routes.
 */
export function errorMiddleware(err: Error, req: Request, res: Response): void {
  // Handle AppError (including Errors factory)
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, method: req.method, url: req.url }, err.message);
    } else {
      logger.warn({ err, method: req.method, url: req.url }, err.message);
    }

    res.status(err.statusCode).json({
      success: false,
      error: err.toJSON(),
    });
    return;
  }

  // Handle legacy AuthError (same shape)
  if (err instanceof AuthError) {
    if (err.statusCode >= 500) {
      logger.error({ err, method: req.method, url: req.url }, err.message);
    } else {
      logger.warn({ err, method: req.method, url: req.url }, err.message);
    }

    res.status(err.statusCode).json({
      success: false,
      error: err.toJSON(),
    });
    return;
  }

  // Unknown errors
  logger.error({ err, method: req.method, url: req.url }, 'Unhandled error');
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
