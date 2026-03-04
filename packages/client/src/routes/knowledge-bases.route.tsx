import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { authenticatedRoute } from './authenticated.route';

export const knowledgeBasesRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/knowledge-bases',
  component: lazyRouteComponent(() => import('@/pages/knowledge-bases/KnowledgeBasesPage')),
});
