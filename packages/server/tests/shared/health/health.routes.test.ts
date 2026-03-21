import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { HealthService } from '@core/health';
import { createHealthRouter } from '@core/health';
import { jsonFetch, startTestServer, stopTestServer } from '@tests/e2e/helpers/e2e.helpers';

describe('shared/health/health.routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns readiness report from /health and /health/ready', async () => {
    const mockService: HealthService = {
      getLiveness: vi.fn(),
      getReadiness: vi.fn().mockResolvedValue({
        status: 'ready',
        timestamp: '2026-03-22T00:00:00.000Z',
        checks: {
          database: { status: 'up', required: true, latencyMs: 1 },
          redis: { status: 'up', required: true, latencyMs: 1 },
          qdrant: { status: 'up', required: true, latencyMs: 1 },
        },
      }),
    };

    const { server, baseUrl } = await startTestServer((app) => {
      app.use(express.json());
      app.use(createHealthRouter(mockService));
    });

    try {
      const health = await jsonFetch(`${baseUrl}/health`);
      const ready = await jsonFetch(`${baseUrl}/health/ready`);

      expect(health.status).toBe(200);
      expect(ready.status).toBe(200);
      expect(health.body).toEqual(ready.body);
      expect(mockService.getReadiness).toHaveBeenCalledTimes(2);
    } finally {
      await stopTestServer(server);
    }
  });

  it('returns 503 when readiness fails and exposes liveness separately', async () => {
    const mockService: HealthService = {
      getLiveness: vi.fn().mockReturnValue({
        status: 'alive',
        timestamp: '2026-03-22T00:00:00.000Z',
        uptimeSeconds: 12,
      }),
      getReadiness: vi.fn().mockResolvedValue({
        status: 'not_ready',
        timestamp: '2026-03-22T00:00:00.000Z',
        checks: {
          database: { status: 'down', required: true, latencyMs: 15, error: 'db unavailable' },
          redis: { status: 'up', required: true, latencyMs: 2 },
          qdrant: { status: 'up', required: true, latencyMs: 3 },
        },
      }),
    };

    const { server, baseUrl } = await startTestServer((app) => {
      app.use(createHealthRouter(mockService));
    });

    try {
      const ready = await jsonFetch(`${baseUrl}/health/ready`);
      const live = await jsonFetch(`${baseUrl}/health/live`);
      const hello = await jsonFetch(`${baseUrl}/api/hello`);

      expect(ready.status).toBe(503);
      expect((ready.body.status as string | undefined) ?? '').toBe('not_ready');
      expect(live.status).toBe(200);
      expect(live.body).toEqual({
        status: 'alive',
        timestamp: '2026-03-22T00:00:00.000Z',
        uptimeSeconds: 12,
      });
      expect(hello.status).toBe(200);
      expect(hello.body).toEqual({ message: 'Hello World!' });
    } finally {
      await stopTestServer(server);
    }
  });
});
