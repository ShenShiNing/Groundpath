import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { authenticatedRoute } from './authenticated.route';

export const securityRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/security',
  component: lazyRouteComponent(() => import('@/pages/SecurityPage')),
});
