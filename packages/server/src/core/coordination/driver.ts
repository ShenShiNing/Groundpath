import { coordinationConfig } from '@config/env';
import { createMemoryCoordinationDriver } from './drivers/memory/memory-coordination.driver';
import { createRedisCoordinationDriver } from './drivers/redis/redis-coordination.driver';
import type { CoordinationDriver } from './types';

let coordinationDriver: CoordinationDriver | null = null;

function createConfiguredCoordinationDriver(): CoordinationDriver {
  switch (coordinationConfig.driver) {
    case 'memory':
      return createMemoryCoordinationDriver();
    case 'redis':
    default:
      return createRedisCoordinationDriver();
  }
}

export function getCoordinationDriver(): CoordinationDriver {
  if (!coordinationDriver) {
    coordinationDriver = createConfiguredCoordinationDriver();
  }

  return coordinationDriver;
}

export async function closeCoordinationDriver(): Promise<void> {
  if (!coordinationDriver?.close) {
    coordinationDriver = null;
    return;
  }

  await coordinationDriver.close();
  coordinationDriver = null;
}

export function resetCoordinationDriverForTests(): void {
  coordinationDriver = null;
}
