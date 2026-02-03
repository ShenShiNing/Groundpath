import { createRoute } from '@tanstack/react-router';
import { rootRoute } from '../__root';
import { requireGuest } from '../guards/auth.guard';
import LoginPage from '@/pages/auth/LoginPage';

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/login',
  beforeLoad: requireGuest,
  component: LoginPage,
});
