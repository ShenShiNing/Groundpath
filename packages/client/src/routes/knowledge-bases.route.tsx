import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { requireAuth } from './guards/auth.guard';

export const knowledgeBasesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/knowledge-bases',
  beforeLoad: requireAuth,
  component: lazyRouteComponent(() => import('@/pages/knowledge-bases/KnowledgeBasesPage')),
});
