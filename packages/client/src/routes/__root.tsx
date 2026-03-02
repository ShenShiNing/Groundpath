import { useEffect } from 'react';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { ensureAccessToken } from '@/lib/http';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RouteError } from '@/components/RouteError';
import { useAuthStore } from '@/stores';

const RootLayout = () => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated || accessToken) {
      return;
    }

    // Recover in-memory access token from refresh token after full page reload.
    void ensureAccessToken().catch(() => {});
  }, [accessToken, isAuthenticated]);

  return (
    <ErrorBoundary>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </ErrorBoundary>
  );
};

export const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  errorComponent: ({ error }) => <RouteError error={error} />,
});
