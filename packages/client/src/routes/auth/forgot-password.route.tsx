import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { rootRoute } from '../__root';
import { requireGuest } from '../guards/auth.guard';

export const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/forgot-password',
  beforeLoad: requireGuest,
  component: lazyRouteComponent(() => import('@/pages/auth/ForgotPasswordPage')),
});
