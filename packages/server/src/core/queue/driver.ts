import { queueConfig, redisConfig } from '@config/env';
import { createBullmqQueueDriver } from './drivers/bullmq/bullmq.driver';
import { createInlineQueueDriver } from './drivers/inline/inline.driver';
import type { QueueDriver } from './types';

let queueDriver: QueueDriver | null = null;

function createConfiguredQueueDriver(): QueueDriver {
  switch (queueConfig.driver) {
    case 'inline':
      return createInlineQueueDriver();
    case 'bullmq':
    default:
      return createBullmqQueueDriver({
        redisUrl: redisConfig.url,
        redisPrefix: redisConfig.prefix,
      });
  }
}

export function getQueueDriver(): QueueDriver {
  if (!queueDriver) {
    queueDriver = createConfiguredQueueDriver();
  }

  return queueDriver;
}

export function resetQueueDriverForTests(): void {
  queueDriver = null;
}
