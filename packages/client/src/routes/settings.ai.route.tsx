import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { authenticatedRoute } from './authenticated.route';

export const aiSettingsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/settings/ai',
  component: lazyRouteComponent(() => import('@/pages/AISettingsPage')),
});
