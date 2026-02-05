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
} from '@shared/middleware';
import { systemLogger } from '@shared/logger/system-logger';
import { initializeScheduler } from '@shared/scheduler';
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

// Logging and parsing
app.use(requestLogger);
app.use(express.json());

// Input sanitization (after JSON parsing)
app.use(sanitizeMiddleware);

// Routes
app.use(router);

// Error handling (should be last)
app.use(errorMiddleware);

app.listen(env.PORT, () => {
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
