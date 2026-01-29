import { createRoute } from '@tanstack/react-router';
import { rootRoute } from '../__root';
import OAuthCallbackPage from '@/pages/auth/OAuthCallbackPage';

export const callbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/callback',
  component: OAuthCallbackPage,
  validateSearch: (search: Record<string, unknown>) => search,
});
