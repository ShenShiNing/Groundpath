import { redirect } from '@tanstack/react-router';
import { useAuthStore } from '@/stores';
import { ensureAccessToken } from '@/lib/http';

/**
 * 认证路由守卫
 * 用于保护需要登录才能访问的路由
 */
export async function requireAuth() {
  const { accessToken, isAuthenticated, clearAuth } = useAuthStore.getState();

  if (accessToken) {
    return;
  }

  if (isAuthenticated) {
    try {
      const refreshedToken = await ensureAccessToken();
      if (refreshedToken) {
        return;
      }
    } catch {
      // Ignore and fall through to redirect.
    }
    clearAuth();
  }

  throw redirect({
    to: '/auth/login',
    search: {
      redirect: window.location.pathname,
    },
  });
}

/**
 * 游客路由守卫
 * 用于已登录用户不应访问的页面（如登录页）
 */
export async function requireGuest() {
  const { accessToken, isAuthenticated, clearAuth } = useAuthStore.getState();

  if (accessToken) {
    throw redirect({
      to: '/dashboard',
    });
  }

  if (isAuthenticated) {
    try {
      const refreshedToken = await ensureAccessToken();
      if (refreshedToken) {
        throw redirect({
          to: '/dashboard',
        });
      }
    } catch {
      clearAuth();
    }
  }
}
