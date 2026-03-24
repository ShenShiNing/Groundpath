import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useRouter } from '@tanstack/react-router';
import { Menu } from 'lucide-react';
import { BRAND_STORAGE_KEYS } from '@groundpath/shared/constants';
import { authApi } from '@/api';
import { UserMenu } from '@/components/layout/UserMenu';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { logClientError } from '@/lib/logger';
import { useAuthStore } from '@/stores';
import { useTranslation } from 'react-i18next';
import { AppSidebar } from './AppSidebar';
import { matchesNavPath } from './appNavigation';

interface AppLayoutProps {
  children: ReactNode;
  showSidebar?: boolean;
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = BRAND_STORAGE_KEYS.sidebarCollapsed;

function getInitialSidebarCollapsedState(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
}

function getCurrentPageLabel(pathname: string, t: ReturnType<typeof useTranslation>['t']): string {
  if (matchesNavPath(pathname, '/dashboard')) {
    return String(t('nav.dashboard', { ns: 'app' }));
  }
  if (matchesNavPath(pathname, '/chat')) {
    return String(t('nav.chat', { ns: 'app' }));
  }
  if (matchesNavPath(pathname, '/knowledge-bases')) {
    return String(t('nav.knowledgeBases', { ns: 'app' }));
  }
  if (matchesNavPath(pathname, '/trash')) {
    return String(t('nav.trash', { ns: 'app' }));
  }
  if (matchesNavPath(pathname, '/profile')) {
    return String(t('profile', { ns: 'common' }));
  }
  if (matchesNavPath(pathname, '/sessions')) {
    return String(t('sessions', { ns: 'common' }));
  }
  if (matchesNavPath(pathname, '/settings/ai')) {
    return String(t('settings', { ns: 'common' }));
  }
  if (matchesNavPath(pathname, '/security')) {
    return String(t('userMenu.security', { ns: 'app' }));
  }

  return String(t('brand', { ns: 'common' }));
}

export function AppLayout({ children, showSidebar = true }: AppLayoutProps) {
  const router = useRouter();
  const location = useLocation();
  const { t } = useTranslation(['app', 'common']);
  const storeIsAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsedState);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const currentPageLabel = getCurrentPageLabel(location.pathname, t);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

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

  if (!storeIsAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <main className="flex-1">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {showSidebar && (
        <div className="hidden h-full md:flex">
          <AppSidebar
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={handleToggleSidebar}
            onLogout={handleLogout}
            variant="desktop"
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {showSidebar && (
          <header className="shrink-0 border-b bg-background/90 px-3 py-3 backdrop-blur md:hidden">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="size-10 rounded-2xl bg-background/70"
                onClick={() => setMobileNavOpen(true)}
                aria-label={t('mobile.openNavigation')}
              >
                <Menu className="size-5" />
              </Button>

              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-semibold">
                  {t('brand', { ns: 'common' })}
                </p>
                <p className="truncate text-xs text-muted-foreground">{currentPageLabel}</p>
              </div>

              <UserMenu onLogout={handleLogout} isCollapsed fullWidth={false} menuSide="bottom" />
            </div>
          </header>
        )}

        <main className="min-h-0 flex-1 flex flex-col overflow-hidden">{children}</main>
      </div>

      {showSidebar && (
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="w-[88vw] max-w-sm p-0 md:hidden">
            <div className="sr-only">
              <SheetTitle>{t('mobile.navigationTitle')}</SheetTitle>
              <SheetDescription>{t('mobile.navigationDescription')}</SheetDescription>
            </div>
            <AppSidebar
              isCollapsed={false}
              onLogout={handleLogout}
              onNavigate={() => setMobileNavOpen(false)}
              variant="mobile"
            />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
