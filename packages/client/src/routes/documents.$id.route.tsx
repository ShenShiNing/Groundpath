import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { requireAuth } from './guards/auth.guard';
import DocumentDetailPage from '@/pages/documents/DocumentDetailPage';

export const documentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/documents/$id',
  beforeLoad: requireAuth,
  component: DocumentDetailPage,
});
