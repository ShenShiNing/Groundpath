// Import Express type augmentations (must be imported for side effects)
import '@shared/types';

import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { createServer, type Server } from 'http';
import { serverConfig } from '@config/env';
import { logger } from '@shared/logger';
import { requestLogger } from '@shared/logger/request-logger';
import {
  errorMiddleware,
  helmetMiddleware,
  corsMiddleware,
  requestIdMiddleware,
  sanitizeMiddleware,
  requestLoggerMiddleware,
} from '@shared/middleware';
import { systemLogger } from '@shared/logger/system-logger';
import { initializeScheduler } from '@shared/scheduler';
import { closeDatabase } from '@shared/db';
import router from './router';

// ==================== App Setup ====================

/**
 * Configure trust proxy settings for reverse proxy environments
 */
function configureTrustProxy(app: Express): void {
  if (!serverConfig.trustProxy) return;

  // Support various formats: 'true', '1', 'loopback', 'linklocal', 'uniquelocal', or specific IPs
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
  // Security middleware (should be first)
  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);

  // Logging and parsing
  app.use(requestLogger);
  app.use(express.json());
  app.use(cookieParser());

  // Input sanitization (after JSON parsing)
  app.use(sanitizeMiddleware);

  // Routes
  app.use(router);

  // Error handling (should be last)
  app.use(errorMiddleware);
}

/**
 * Create and configure Express application
 */
function createApp(): Express {
  const app = express();
  configureTrustProxy(app);
  setupMiddleware(app);
  return app;
}

// ==================== Server Lifecycle ====================

/**
 * Configure HTTP server timeouts
 */
function configureServer(server: Server): void {
  server.timeout = serverConfig.timeout;
  server.keepAliveTimeout = serverConfig.keepAliveTimeout;
}

/**
 * Handle server startup tasks
 */
function onServerStart(): void {
  logger.info({ port: serverConfig.port, env: serverConfig.nodeEnv }, 'Server started');

  // Log startup event to database
  systemLogger.startup(`Server started on port ${serverConfig.port}`, {
    port: serverConfig.port,
    environment: serverConfig.nodeEnv,
    nodeVersion: process.version,
  });

  // Initialize scheduled tasks
  initializeScheduler();
}

/**
 * Graceful shutdown handler
 */
function createShutdownHandler(server: Server): (signal: string) => void {
  return (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal, closing server gracefully');

    server.close(async (err) => {
      if (err) {
        logger.error({ err }, 'Error during server shutdown');
        process.exit(1);
      }

      // Close database connection pool
      try {
        await closeDatabase();
        logger.info('Database connections closed');
      } catch (dbErr) {
        logger.error({ err: dbErr }, 'Error closing database connections');
      }

      logger.info('Server closed successfully');
      process.exit(0);
    });

    // Force exit after timeout
    setTimeout(() => {
      logger.warn('Forced shutdown due to timeout');
      process.exit(1);
    }, serverConfig.shutdownTimeout);
  };
}

/**
 * Start the HTTP server
 */
function startServer(): void {
  const app = createApp();
  const server = createServer(app);

  configureServer(server);

  server.listen(serverConfig.port, onServerStart);

  // Register shutdown handlers
  const shutdown = createShutdownHandler(server);
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// ==================== Entry Point ====================

startServer();
