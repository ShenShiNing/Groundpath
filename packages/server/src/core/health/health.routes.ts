import { Router, type Request, type Response } from 'express';
import type { HealthService } from './health.service';
import { healthService } from './health.service';

function getReadinessStatusCode(status: 'ready' | 'not_ready'): number {
  return status === 'ready' ? 200 : 503;
}

export function createHealthRouter(service: HealthService = healthService): Router {
  const router = Router();

  router.get('/health', async (_req: Request, res: Response) => {
    const report = await service.getReadiness();
    res.status(getReadinessStatusCode(report.status)).json(report);
  });

  router.get('/health/live', (_req: Request, res: Response) => {
    res.json(service.getLiveness());
  });

  router.get('/health/ready', async (_req: Request, res: Response) => {
    const report = await service.getReadiness();
    res.status(getReadinessStatusCode(report.status)).json(report);
  });

  // Backward-compatible lightweight probe retained for older checklists.
  router.get('/api/hello', (_req: Request, res: Response) => {
    res.json({ message: 'Hello World!' });
  });

  return router;
}

export const healthRoutes = createHealthRouter();
