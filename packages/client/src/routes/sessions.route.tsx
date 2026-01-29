import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import SessionsPage from '@/pages/SessionsPage';

export const sessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sessions',
  component: SessionsPage,
});
