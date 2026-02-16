import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { rootRoute } from '../__root';
import { requireGuest } from '../guards/auth.guard';

export const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/signup',
  beforeLoad: requireGuest,
  component: lazyRouteComponent(() => import('@/pages/auth/SignupPage')),
});
