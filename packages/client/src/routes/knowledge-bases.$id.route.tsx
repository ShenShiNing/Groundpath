import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { requireAuth } from './guards/auth.guard';

export const knowledgeBaseDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/knowledge-bases/$id',
  beforeLoad: requireAuth,
  component: lazyRouteComponent(() => import('@/pages/knowledge-bases/KnowledgeBaseDetailPage')),
});
