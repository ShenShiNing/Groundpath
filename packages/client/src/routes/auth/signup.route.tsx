import { createRoute } from '@tanstack/react-router';
import { rootRoute } from '../__root';
import { requireGuest } from '../guards/auth.guard';
import SignupPage from '@/pages/auth/SignupPage';

export const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/signup',
  beforeLoad: requireGuest,
  component: SignupPage,
});
