import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { RouteError } from '@/components/RouteError';
import { authenticatedRoute } from './authenticated.route';

export const knowledgeBaseDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/knowledge-bases/$id',
  component: lazyRouteComponent(() => import('@/pages/knowledge-bases/KnowledgeBaseDetailPage')),
  errorComponent: ({ error, reset }) => (
    <RouteError
      error={error}
      reset={reset}
      titleKey="route.knowledgeBaseDetail.title"
      defaultMessageKey="route.knowledgeBaseDetail.defaultMessage"
    />
  ),
});
