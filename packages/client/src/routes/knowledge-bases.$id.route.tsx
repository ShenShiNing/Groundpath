import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import KnowledgeBaseDetailPage from '@/pages/knowledge-bases/KnowledgeBaseDetailPage';

export const knowledgeBaseDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/knowledge-bases/$id',
  component: KnowledgeBaseDetailPage,
});
