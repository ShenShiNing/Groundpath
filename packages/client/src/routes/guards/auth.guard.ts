import { redirect } from '@tanstack/react-router';
import { useAuthStore } from '@/stores';

/**
 * 认证路由守卫
 * 用于保护需要登录才能访问的路由
 */
export function requireAuth() {
  const { accessToken } = useAuthStore.getState();

  if (!accessToken) {
    throw redirect({
      to: '/auth/login',
      search: {
        redirect: window.location.pathname,
      },
    });
  }
}

/**
 * 游客路由守卫
 * 用于已登录用户不应访问的页面（如登录页）
 */
export function requireGuest() {
  const { accessToken } = useAuthStore.getState();

  if (accessToken) {
    throw redirect({
      to: '/dashboard',
    });
  }
}
