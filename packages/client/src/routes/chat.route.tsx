import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { RouteError } from '@/components/RouteError';
import { authenticatedRoute } from './authenticated.route';

export const chatRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/chat',
  component: lazyRouteComponent(() => import('@/pages/ChatPage')),
  errorComponent: ({ error, reset }) => (
    <RouteError
      error={error}
      reset={reset}
      titleKey="route.chat.title"
      defaultMessageKey="route.chat.defaultMessage"
    />
  ),
});
