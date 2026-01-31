import express from 'express';
import { env } from '@config/env';
import { logger } from '@shared/logger';
import { requestLogger } from '@shared/logger/request-logger';
import { errorMiddleware } from '@shared/middleware/error.middleware';
import { systemLogger } from '@shared/logger/system-logger';
import { initializeScheduler } from '@shared/scheduler';
import router from './router';

const app = express();

app.use(requestLogger);
app.use(express.json());
app.use(router);
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
});
