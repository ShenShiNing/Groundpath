import { sql } from 'drizzle-orm';
import { healthConfig } from '@config/env';
import { db } from '@core/db';
import { getRedisClient } from '@core/redis';
import { isRedisRequired } from '@core/redis';
import { getQdrantClient } from '@modules/vector/public/qdrant';

export type HealthStatus = 'up' | 'down';
export type ReadinessStatus = 'ready' | 'not_ready';
export type HealthDependencyName = 'database' | 'redis' | 'qdrant';

export interface HealthDependencyResult {
  status: HealthStatus;
  required: true;
  latencyMs: number;
  error?: string;
}

export interface LivenessReport {
  status: 'alive';
  timestamp: string;
  uptimeSeconds: number;
}

export interface ReadinessReport {
  status: ReadinessStatus;
  timestamp: string;
  checks: Partial<Record<HealthDependencyName, HealthDependencyResult>>;
}

interface HealthServiceDependencies {
  pingDatabase: () => Promise<void>;
  pingRedis: () => Promise<void>;
  pingQdrant: () => Promise<void>;
  now: () => Date;
  uptimeSeconds: () => number;
  readinessTimeoutMs: number;
  isRedisRequired: () => boolean;
}

const defaultDependencies: HealthServiceDependencies = {
  pingDatabase: async () => {
    await db.execute(sql`SELECT 1`);
  },
  pingRedis: async () => {
    await getRedisClient().ping();
  },
  pingQdrant: async () => {
    await getQdrantClient().getCollections();
  },
  now: () => new Date(),
  uptimeSeconds: () => process.uptime(),
  readinessTimeoutMs: healthConfig.readinessTimeoutMs,
  isRedisRequired,
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unknown health check error';
}

function createTimeoutError(timeoutMs: number): Error {
  return new Error(`Health check timed out after ${timeoutMs}ms`);
}

async function withTimeout(task: () => Promise<void>, timeoutMs: number): Promise<void> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      task(),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(createTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function runDependencyCheck(
  dependency: HealthDependencyName,
  timeoutMs: number,
  check: () => Promise<void>
): Promise<[HealthDependencyName, HealthDependencyResult]> {
  const startedAt = Date.now();

  try {
    await withTimeout(check, timeoutMs);
    return [
      dependency,
      {
        status: 'up',
        required: true,
        latencyMs: Date.now() - startedAt,
      },
    ];
  } catch (error) {
    return [
      dependency,
      {
        status: 'down',
        required: true,
        latencyMs: Date.now() - startedAt,
        error: toErrorMessage(error),
      },
    ];
  }
}

export interface HealthService {
  getLiveness(): LivenessReport;
  getReadiness(): Promise<ReadinessReport>;
}

export function createHealthService(
  dependencies: Partial<HealthServiceDependencies> = {}
): HealthService {
  const deps = { ...defaultDependencies, ...dependencies };

  return {
    getLiveness() {
      return {
        status: 'alive',
        timestamp: deps.now().toISOString(),
        uptimeSeconds: Math.floor(deps.uptimeSeconds()),
      };
    },
    async getReadiness() {
      const checkTasks = [
        runDependencyCheck('database', deps.readinessTimeoutMs, deps.pingDatabase),
        ...(deps.isRedisRequired()
          ? [runDependencyCheck('redis', deps.readinessTimeoutMs, deps.pingRedis)]
          : []),
        runDependencyCheck('qdrant', deps.readinessTimeoutMs, deps.pingQdrant),
      ];

      const checks = Object.fromEntries(await Promise.all(checkTasks)) as ReadinessReport['checks'];

      const status = Object.values(checks).every((check) => check.status === 'up')
        ? 'ready'
        : 'not_ready';

      return {
        status,
        timestamp: deps.now().toISOString(),
        checks,
      };
    },
  };
}

export const healthService = createHealthService();
