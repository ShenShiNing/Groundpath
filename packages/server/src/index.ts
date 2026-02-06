// Import Express type augmentations (must be imported for side effects)
import '@shared/types';

import express from 'express';
import { env } from '@config/env';
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
import { createServer } from 'http';
import { closeDatabase } from '@shared/db';
import router from './router';

const app = express();

// Trust proxy settings (must be set before other middleware)
// Required for correct client IP detection behind reverse proxy (nginx, cloudflare, etc.)
if (env.TRUST_PROXY) {
  // Support various formats: 'true', '1', 'loopback', 'linklocal', 'uniquelocal', or specific IPs
  const trustValue =
    env.TRUST_PROXY === 'true'
      ? true
      : /^\d+$/.test(env.TRUST_PROXY)
        ? parseInt(env.TRUST_PROXY, 10)
        : env.TRUST_PROXY;
  app.set('trust proxy', trustValue);
  logger.info({ trustProxy: trustValue }, 'Trust proxy enabled');
}

// Security middleware (should be first)
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);

// Logging and parsing
app.use(requestLogger);
app.use(express.json());

// Input sanitization (after JSON parsing)
app.use(sanitizeMiddleware);

// Routes
app.use(router);

// 404 handler for undefined routes (must be after all routes)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.url} not found`,
      requestId: req.requestId,
    },
  });
});

// Error handling (should be last)
app.use(errorMiddleware);

// 创建 HTTP 服务器
const server = createServer(app);

// 配置超时 (任务 9)
server.timeout = 30000; // 30 秒请求超时
server.keepAliveTimeout = 65000; // Keep-alive 超时

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');

  // Log startup event to database
  systemLogger.startup(`Server started on port ${env.PORT}`, {
    port: env.PORT,
    environment: env.NODE_ENV,
    nodeVersion: process.version,
  });

  // Initialize scheduled tasks
  initializeScheduler();

  // Note: Qdrant collections are now created on-demand per knowledge base
  // when documents are uploaded or processed. See knowledge-base.service.ts
});

// Graceful Shutdown
const shutdown = (signal: string) => {
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

  // Force exit timeout
  setTimeout(() => {
    logger.warn('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
