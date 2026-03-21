import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { serverConfig } from '@config/env';
import { logger } from '@core/logger';
import { requestLogger } from '@core/logger/request-logger';
import { healthRoutes } from '@core/health';
import {
  errorMiddleware,
  helmetMiddleware,
  corsMiddleware,
  requestIdMiddleware,
  sanitizeMiddleware,
  requestLoggerMiddleware,
} from '@core/middleware';
import { setupOpenApi } from '@core/openapi';
import router from './router';

/**
 * Configure trust proxy settings for reverse proxy environments
 */
function configureTrustProxy(app: Express): void {
  if (!serverConfig.trustProxy) return;

  const trustValue =
    serverConfig.trustProxy === 'true'
      ? true
      : /^\d+$/.test(serverConfig.trustProxy)
        ? parseInt(serverConfig.trustProxy, 10)
        : serverConfig.trustProxy;

  app.set('trust proxy', trustValue);
  logger.info({ trustProxy: trustValue }, 'Trust proxy enabled');
}

/**
 * Register all middleware in correct order
 */
function setupMiddleware(app: Express): void {
  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);

  app.use(requestLogger);
  app.use(express.json());
  app.use(cookieParser());

  app.use(sanitizeMiddleware);

  app.use(healthRoutes);
  app.use(router);

  setupOpenApi(app);

  app.use(errorMiddleware);
}

/**
 * Create and configure Express application
 */
export function createApp(): Express {
  const app = express();
  configureTrustProxy(app);
  setupMiddleware(app);
  return app;
}
