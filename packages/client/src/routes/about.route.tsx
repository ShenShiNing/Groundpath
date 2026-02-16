import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { rootRoute } from './__root';

export const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: lazyRouteComponent(() => import('@/pages/About')),
});
