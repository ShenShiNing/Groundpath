import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { requireAuth } from './guards/auth.guard';

export const documentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/documents/$id',
  beforeLoad: requireAuth,
  component: lazyRouteComponent(() => import('@/pages/documents/DocumentDetailPage')),
});
