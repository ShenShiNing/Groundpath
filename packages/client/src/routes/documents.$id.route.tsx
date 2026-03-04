import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { authenticatedRoute } from './authenticated.route';

export const documentDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/documents/$id',
  component: lazyRouteComponent(() => import('@/pages/documents/DocumentDetailPage')),
});
