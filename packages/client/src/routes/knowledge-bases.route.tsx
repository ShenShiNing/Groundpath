import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { requireAuth } from './guards/auth.guard';
import KnowledgeBasesPage from '@/pages/knowledge-bases/KnowledgeBasesPage';

export const knowledgeBasesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/knowledge-bases',
  beforeLoad: requireAuth,
  component: KnowledgeBasesPage,
});
