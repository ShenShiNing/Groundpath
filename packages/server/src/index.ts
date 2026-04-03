// Import Express type augmentations (must be imported for side effects)
import '@core/types';

import { createServer, type Server } from 'http';
import { serverConfig } from '@config/env';
import { logger } from '@core/logger';
import { systemLogger } from '@core/logger/system-logger';
import { initializeScheduler } from '@core/scheduler';
import { closeDatabase } from '@core/db';
import { closeRedis, connectRedis } from '@core/redis';
import { createShutdownHandler } from '@core/server/shutdown';
import {
  startDocumentProcessingWorker,
  stopDocumentProcessingWorker,
  enqueueDocumentProcessing,
} from '@modules/rag/public/queue';
import { documentProcessingBackfillLifecycleListener } from '@modules/document-index/public/document-processing';
import { registerDocumentProcessingDispatcher } from './core/document-processing';
import { registerDocumentProcessingLifecycleListener } from './core/document-processing';
import { createApp } from './app';

// ==================== Composition Root ====================

// Wire the document → rag dependency via port (breaks circular import)
registerDocumentProcessingDispatcher({ enqueue: enqueueDocumentProcessing });
registerDocumentProcessingLifecycleListener(documentProcessingBackfillLifecycleListener);

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
