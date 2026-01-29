import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import ProfilePage from '@/pages/ProfilePage';

export const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: ProfilePage,
});
