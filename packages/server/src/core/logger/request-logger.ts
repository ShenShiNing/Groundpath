import pinoHttp from 'pino-http';
import { logger } from './index';
import { sanitizeRequestPath } from './redaction';

// Slow request threshold in milliseconds
const SLOW_REQUEST_THRESHOLD_MS = 1000;

export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => {
      const url = req.url ?? '';
      if (url === '/api/hello' || url === '/health' || url.startsWith('/health/')) return true;
      // Skip non-API paths — browser extensions, frontend routes, etc.
      if (!url.startsWith('/api/')) return true;
      return false;
    },
  },
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Add response time to log
  customSuccessMessage: (req, res, responseTime) => {
    const method = req.method;
    const path = sanitizeRequestPath(req.url);
    const status = res.statusCode;

    if (responseTime >= SLOW_REQUEST_THRESHOLD_MS) {
      return `[SLOW] ${method} ${path} ${status} - ${responseTime.toFixed(0)}ms`;
    }

    return `${method} ${path} ${status} - ${responseTime.toFixed(0)}ms`;
  },
  customErrorMessage: (req, res, err) => {
    const path = sanitizeRequestPath(req.url);
    return `${req.method} ${path} ${res.statusCode} - ${err.message}`;
  },
  // Serialize additional fields
  serializers: {
    req: (req) => ({
      method: req.method,
      path: sanitizeRequestPath(req.url),
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
  // Custom attributes for slow request detection
  customAttributeKeys: {
    responseTime: 'responseTime',
  },
  // Add custom props
  customProps: (req, res) => {
    const responseTime = res.getHeader('X-Response-Time');
    return {
      requestId:
        req.headers['x-request-id'] || (req as unknown as { requestId?: string }).requestId,
      ...(responseTime && Number(responseTime) >= SLOW_REQUEST_THRESHOLD_MS && { slow: true }),
    };
  },
});
