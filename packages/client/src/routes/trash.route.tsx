import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { authenticatedRoute } from './authenticated.route';

export const trashRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/trash',
  component: lazyRouteComponent(() => import('@/pages/documents/TrashPage')),
});
