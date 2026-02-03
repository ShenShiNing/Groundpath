import { createRoute } from '@tanstack/react-router';
import { rootRoute } from '../__root';
import { requireGuest } from '../guards/auth.guard';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';

export const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/forgot-password',
  beforeLoad: requireGuest,
  component: ForgotPasswordPage,
});
