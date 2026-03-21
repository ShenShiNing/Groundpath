import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { RouteError } from '@/components/RouteError';
import { authenticatedRoute } from './authenticated.route';

export const documentDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/documents/$id',
  component: lazyRouteComponent(() => import('@/pages/documents/DocumentDetailPage')),
  validateSearch: (search: Record<string, unknown>) => ({
    fromKnowledgeBaseId:
      typeof search.fromKnowledgeBaseId === 'string' ? search.fromKnowledgeBaseId : undefined,
  }),
  errorComponent: ({ error, reset }) => (
    <RouteError
      error={error}
      reset={reset}
      titleKey="route.documentDetail.title"
      defaultMessageKey="route.documentDetail.defaultMessage"
    />
  ),
});
