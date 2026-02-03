import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { requireAuth } from './guards/auth.guard';
import SessionsPage from '@/pages/SessionsPage';

export const sessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sessions',
  beforeLoad: requireAuth,
  component: SessionsPage,
});
