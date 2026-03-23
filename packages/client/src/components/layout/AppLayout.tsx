import { useCallback, useEffect, useState } from 'react';
import { PanelLeft } from 'lucide-react';
import { useLocation, useRouter } from '@tanstack/react-router';
import { BRAND_STORAGE_KEYS } from '@groundpath/shared/constants';
import { authApi } from '@/api';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { logClientError } from '@/lib/logger';
import { useAuthStore } from '@/stores';
import { useTranslation } from 'react-i18next';
import { AppSidebar } from './AppSidebar';

// ============================================================================
// Types
// ============================================================================

interface AppLayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = BRAND_STORAGE_KEYS.sidebarCollapsed;
const MOBILE_LAYOUT_QUERY = '(max-width: 767px)';

function getInitialSidebarCollapsedState(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
}

function getInitialMobileState(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
}

export function AppLayout({ children, showSidebar = true }: AppLayoutProps) {
  const { t } = useTranslation(['app', 'common']);
  const router = useRouter();
  const location = useLocation();
  const storeIsAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsedState);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(getInitialMobileState);

  const handleLogout = useCallback(async () => {
    try {
      if (storeIsAuthenticated) {
        await authApi.logout();
      }
    } catch (error) {
      logClientError('AppLayout.handleLogout', error);
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

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const updateIsMobile = (event?: MediaQueryListEvent) => {
      setIsMobile(event?.matches ?? mediaQuery.matches);
    };

    updateIsMobile();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateIsMobile);
      return () => mediaQuery.removeEventListener('change', updateIsMobile);
    }

    mediaQuery.addListener(updateIsMobile);
    return () => mediaQuery.removeListener(updateIsMobile);
  }, []);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobile) {
      setMobileSidebarOpen(false);
    }
  }, [isMobile]);

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
    <div className="flex h-screen overflow-hidden bg-background">
      {showSidebar && !isMobile && (
        <AppSidebar
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
          onLogout={handleLogout}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {showSidebar && isMobile && (
          <>
            <header className="flex h-14 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 rounded-lg"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label={t('sidebar.openNavigation', { ns: 'app' })}
              >
                <PanelLeft className="size-4" />
              </Button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{t('brand', { ns: 'common' })}</p>
              </div>
            </header>

            <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
              <SheetContent
                side="left"
                className="w-[min(20rem,calc(100vw-1rem))] border-r p-0"
                showCloseButton={false}
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>{t('sidebar.navigation', { ns: 'app' })}</SheetTitle>
                </SheetHeader>
                <AppSidebar
                  isCollapsed={false}
                  isMobile
                  className="h-full border-r-0"
                  onToggleCollapse={handleToggleSidebar}
                  onLogout={handleLogout}
                  onNavigate={() => setMobileSidebarOpen(false)}
                />
              </SheetContent>
            </Sheet>
          </>
        )}

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
