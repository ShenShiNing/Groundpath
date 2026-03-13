import { useCallback, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { authApi } from '@/api';
import { useAuthStore } from '@/stores';
import { AppSidebar } from './AppSidebar';

// ============================================================================
// Types
// ============================================================================

interface AppLayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'knowledge-agent.sidebar-collapsed';

function getInitialSidebarCollapsedState(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
}

export function AppLayout({ children, showSidebar = true }: AppLayoutProps) {
  const router = useRouter();
  const storeIsAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsedState);

  const handleLogout = useCallback(async () => {
    try {
      if (storeIsAuthenticated) {
        await authApi.logout();
      }
    } finally {
      clearAuth();
      await router.navigate({ to: '/auth/login' });
    }
  }, [storeIsAuthenticated, clearAuth, router]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  // Non-authenticated layout (landing pages, auth pages)
  if (!storeIsAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <main className="flex-1">{children}</main>
      </div>
    );
  }

  // Authenticated layout with sidebar
  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {showSidebar && (
        <AppSidebar
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
          onLogout={handleLogout}
        />
      )}
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
