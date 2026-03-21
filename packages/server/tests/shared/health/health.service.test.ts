import { describe, expect, it, vi } from 'vitest';
import { createHealthService } from '@core/health';

describe('shared/health/health.service', () => {
  it('returns alive status with uptime for liveness checks', () => {
    const service = createHealthService({
      now: () => new Date('2026-03-22T00:00:00.000Z'),
      uptimeSeconds: () => 42.8,
    });

    expect(service.getLiveness()).toEqual({
      status: 'alive',
      timestamp: '2026-03-22T00:00:00.000Z',
      uptimeSeconds: 42,
    });
  });

  it('returns ready when all dependencies are reachable', async () => {
    const service = createHealthService({
      pingDatabase: vi.fn().mockResolvedValue(undefined),
      pingRedis: vi.fn().mockResolvedValue(undefined),
      pingQdrant: vi.fn().mockResolvedValue(undefined),
      now: () => new Date('2026-03-22T00:00:00.000Z'),
    });

    await expect(service.getReadiness()).resolves.toMatchObject({
      status: 'ready',
      timestamp: '2026-03-22T00:00:00.000Z',
      checks: {
        database: { status: 'up', required: true },
        redis: { status: 'up', required: true },
        qdrant: { status: 'up', required: true },
      },
    });
  });

  it('returns not_ready and surfaces failed dependencies', async () => {
    const service = createHealthService({
      pingDatabase: vi.fn().mockRejectedValue(new Error('db unavailable')),
      pingRedis: vi.fn().mockResolvedValue(undefined),
      pingQdrant: vi.fn().mockRejectedValue(new Error('qdrant unavailable')),
      now: () => new Date('2026-03-22T00:00:00.000Z'),
    });

    await expect(service.getReadiness()).resolves.toMatchObject({
      status: 'not_ready',
      checks: {
        database: { status: 'down', error: 'db unavailable' },
        redis: { status: 'up' },
        qdrant: { status: 'down', error: 'qdrant unavailable' },
      },
    });
  });
});
