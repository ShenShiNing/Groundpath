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
import { closeRedis, connectRedis } from '@shared/redis';
import { createShutdownHandler } from '@shared/server/shutdown';
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
 * Start the HTTP server
 */
async function startServer(): Promise<void> {
  await connectRedis();

  const app = createApp();
  const server = createServer(app);

  configureServer(server);

  server.listen(serverConfig.port, onServerStart);

  // Register shutdown handlers
  const shutdown = createShutdownHandler(server, {
    closeDatabase,
    closeRedis,
    logger,
    shutdownTimeout: serverConfig.shutdownTimeout,
    exit: (code) => process.exit(code),
  });
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// ==================== Entry Point ====================

startServer().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});
