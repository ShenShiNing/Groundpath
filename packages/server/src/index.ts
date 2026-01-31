import express from 'express';
import { env } from '@config/env';
import { logger } from '@shared/logger';
import { requestLogger } from '@shared/logger/request-logger';
import { errorMiddleware } from '@shared/middleware/error.middleware';
import router from './router';

const app = express();

app.use(requestLogger);
app.use(express.json());
app.use(router);
app.use(errorMiddleware);

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
});
