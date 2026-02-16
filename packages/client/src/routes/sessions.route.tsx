import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { requireAuth } from './guards/auth.guard';

export const sessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sessions',
  beforeLoad: requireAuth,
  component: lazyRouteComponent(() => import('@/pages/SessionsPage')),
});
