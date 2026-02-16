import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { rootRoute } from '../__root';
import { requireGuest } from '../guards/auth.guard';

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/login',
  beforeLoad: requireGuest,
  component: lazyRouteComponent(() => import('@/pages/auth/LoginPage')),
});
