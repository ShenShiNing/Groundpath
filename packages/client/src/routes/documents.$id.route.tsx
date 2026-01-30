import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import DocumentDetailPage from '@/pages/documents/DocumentDetailPage';

export const documentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/documents/$id',
  component: DocumentDetailPage,
});
