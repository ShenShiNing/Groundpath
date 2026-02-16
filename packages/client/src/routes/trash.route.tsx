import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { requireAuth } from './guards/auth.guard';

export const trashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trash',
  beforeLoad: requireAuth,
  component: lazyRouteComponent(() => import('@/pages/documents/TrashPage')),
});
