import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import KnowledgeBasesPage from '@/pages/knowledge-bases/KnowledgeBasesPage';

export const knowledgeBasesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/knowledge-bases',
  component: KnowledgeBasesPage,
});
