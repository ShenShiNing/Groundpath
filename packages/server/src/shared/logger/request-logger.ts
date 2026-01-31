import pinoHttp from 'pino-http';
import { logger } from './index';

export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => ['/api/hello', '/health'].includes(req.url ?? ''),
  },
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
