import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { authenticatedRoute } from './authenticated.route';

export const chatRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/chat',
  component: lazyRouteComponent(() => import('@/pages/ChatPage')),
});
