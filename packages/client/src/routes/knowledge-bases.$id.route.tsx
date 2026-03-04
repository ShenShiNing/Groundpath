import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { authenticatedRoute } from './authenticated.route';

export const knowledgeBaseDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/knowledge-bases/$id',
  component: lazyRouteComponent(() => import('@/pages/knowledge-bases/KnowledgeBaseDetailPage')),
});
