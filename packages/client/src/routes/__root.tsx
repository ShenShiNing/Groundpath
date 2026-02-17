import { useEffect } from 'react';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { ensureAccessToken } from '@/lib/http';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { useAuthStore } from '@/stores';

const RootLayout = () => {
  const { accessToken, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || accessToken) {
      return;
    }

    // Recover in-memory access token from refresh token after full page reload.
    void ensureAccessToken().catch(() => {});
  }, [accessToken, isAuthenticated]);

  return (
    <>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </>
  );
};

export const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});
