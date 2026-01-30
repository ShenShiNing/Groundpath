import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import DocumentsPage from '@/pages/documents/DocumentsPage';

export const documentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/documents',
  component: DocumentsPage,
});
