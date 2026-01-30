import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import TrashPage from '@/pages/documents/TrashPage';

export const trashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trash',
  component: TrashPage,
});
