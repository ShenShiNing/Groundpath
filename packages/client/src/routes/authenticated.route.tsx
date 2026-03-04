import { createRoute, Outlet } from '@tanstack/react-router';
import { AppLayout } from '@/components/layout/AppLayout';
import { rootRoute } from './__root';
import { requireAuth } from './guards/auth.guard';

function AuthenticatedLayout() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

export const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  beforeLoad: requireAuth,
  component: AuthenticatedLayout,
});
