import { createRoute } from '@tanstack/react-router';
import { rootRoute } from '../__root';
import LoginPage from '@/pages/auth/LoginPage';

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/login',
  component: LoginPage,
});
