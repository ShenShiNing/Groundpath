import type { Request, Response, NextFunction } from 'express';
import { createRequestLogger } from '@shared/logger';

/**
 * Middleware to attach request-scoped logger with requestId
 * and log request completion with duration
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  req.log = createRequestLogger('http', req.requestId);

  // Log request completion with duration when response finishes
  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const url = req.originalUrl || req.url;
    const logData = {
      method: req.method,
      url,
      statusCode: res.statusCode,
      durationMs,
    };

    // Skip non-API 404s — browser extensions, frontend routes hitting the backend
    if (res.statusCode === 404 && !url.startsWith('/api/')) {
      req.log.debug(logData, 'Non-API path not found (ignored)');
      return;
    }

    // Use appropriate log level based on status code
    if (res.statusCode >= 500) {
      req.log.error(logData, 'Request completed with error');
    } else if (res.statusCode >= 400) {
      req.log.warn(logData, 'Request completed with client error');
    } else {
      req.log.info(logData, 'Request completed');
    }
  });

  next();
}
