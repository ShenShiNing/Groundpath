import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { requireAuth } from './guards/auth.guard';

export const aiSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/ai',
  beforeLoad: requireAuth,
  component: lazyRouteComponent(() => import('@/pages/AISettingsPage')),
});
