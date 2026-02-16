import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { rootRoute } from '../__root';

export const callbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/callback',
  component: lazyRouteComponent(() => import('@/pages/auth/OAuthCallbackPage')),
  validateSearch: (search: Record<string, unknown>) => search,
});
