import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { authenticatedRoute } from './authenticated.route';

export const sessionsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/sessions',
  component: lazyRouteComponent(() => import('@/pages/SessionsPage')),
});
