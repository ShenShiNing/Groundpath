// Import Express type augmentations (must be imported for side effects)
import '@core/types';

import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { createServer, type Server } from 'http';
import { serverConfig } from '@config/env';
import { logger } from '@core/logger';
import { requestLogger } from '@core/logger/request-logger';
import {
  errorMiddleware,
  helmetMiddleware,
  corsMiddleware,
  requestIdMiddleware,
  sanitizeMiddleware,
  requestLoggerMiddleware,
} from '@core/middleware';
import { systemLogger } from '@core/logger/system-logger';
import { initializeScheduler } from '@core/scheduler';
import { closeDatabase } from '@core/db';
import { closeRedis, connectRedis } from '@core/redis';
import { createShutdownHandler } from '@core/server/shutdown';
import {
  startDocumentProcessingWorker,
  stopDocumentProcessingWorker,
  enqueueDocumentProcessing,
} from '@modules/rag';
import { registerDocumentProcessingDispatcher } from '@modules/document';
import { setupOpenApi } from '@core/openapi';
import router from './router';

// ==================== Composition Root ====================

// Wire the document → rag dependency via port (breaks circular import)
registerDocumentProcessingDispatcher({ enqueue: enqueueDocumentProcessing });

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

  // OpenAPI docs (after routes, before error handler)
  setupOpenApi(app);

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

  // Start background workers
  startDocumentProcessingWorker();
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
    closeWorkers: stopDocumentProcessingWorker,
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
