import { useState, useCallback, useEffect } from 'react';
import { Link, useRouter, useLocation } from '@tanstack/react-router';
import {
  Brain,
  LogOut,
  PanelLeft,
  PanelLeftClose,
  LayoutDashboard,
  User,
  Settings,
  Monitor,
  Database,
  Trash2,
  ChevronDown,
  Search,
  Plus,
  Languages,
  Sun,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTheme } from '@/components/theme/theme-provider';
import { useTranslation } from 'react-i18next';
import { ChatSearchDialog, ConversationList } from '@/components/chat';
import { useAuthStore, useChatPanelStore } from '@/stores';
import { authApi } from '@/api';

// ============================================================================
// Types
// ============================================================================

interface AppLayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
}

type NavItemLabelKey = 'nav.dashboard' | 'nav.knowledgeBases' | 'nav.trash';

interface NavItem {
  labelKey: NavItemLabelKey;
  to: string;
  icon: React.ReactNode;
}

// ============================================================================
// Constants
// ============================================================================

const mainNavItems: NavItem[] = [
  { labelKey: 'nav.dashboard', to: '/dashboard', icon: <LayoutDashboard className="size-4" /> },
  {
    labelKey: 'nav.knowledgeBases',
    to: '/knowledge-bases',
    icon: <Database className="size-4" />,
  },
  {
    labelKey: 'nav.trash',
    to: '/trash',
    icon: <Trash2 className="size-4" />,
  },
];

// ============================================================================
// Utility Functions
// ============================================================================

function getUserInitials(username?: string, email?: string): string {
  if (username) return username.slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return 'U';
}

// ============================================================================
// Sidebar Navigation Item
// ============================================================================

function SidebarNavItem({
  item,
  isCollapsed,
  isActive,
}: {
  item: NavItem;
  isCollapsed: boolean;
  isActive: boolean;
}) {
  const { t } = useTranslation(['app', 'document']);
  const label =
    item.labelKey === 'nav.trash'
      ? String(
          t('nav.trash', {
            ns: 'app',
            defaultValue: t('trash.page.title', { ns: 'document' }),
          })
        )
      : String(t(item.labelKey, { ns: 'app' }));
  const content = (
    <Link
      to={item.to}
      className={cn(
        'flex items-center rounded-lg text-sm transition-colors',
        isCollapsed ? 'h-9 w-full justify-center px-0 py-0' : 'gap-2 px-2.5 py-2',
        isActive
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      {item.icon}
      {!isCollapsed && <span>{label}</span>}
    </Link>
  );

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

// ============================================================================
// User Menu Component
// ============================================================================

function UserMenu({ onLogout, isCollapsed }: { onLogout: () => void; isCollapsed: boolean }) {
  const { t, i18n } = useTranslation(['app', 'common', 'language']);
  const { theme, setTheme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const userInitials = getUserInitials(user?.username, user?.email);
  const displayName = user?.username ?? t('user', { ns: 'common' });
  const currentLanguage =
    i18n.resolvedLanguage === 'en-US' || i18n.language === 'en-US' ? 'en-US' : 'zh-CN';

  const handleThemeChange = (value: string) => {
    if (value === 'system' || value === 'dark' || value === 'light') {
      setTheme(value);
    }
  };

  const handleLanguageChange = (value: string) => {
    if (value !== 'zh-CN' && value !== 'en-US') return;
    void i18n.changeLanguage(value);
    localStorage.setItem('knowledge-agent.language', value);
    document.documentElement.lang = value;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex w-full items-center rounded-md text-sm transition-colors hover:bg-accent',
            isCollapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2 text-left'
          )}
        >
          <Avatar size="sm">
            <AvatarImage src={user?.avatarUrl ?? undefined} alt={displayName} />
            <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
          </Avatar>
          {!isCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{displayName}</p>
              </div>
              <ChevronDown className="size-4 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={isCollapsed ? 'center' : 'start'}
        side={isCollapsed ? 'right' : 'top'}
        className="w-56"
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/profile">
              <User className="size-4 mr-2" />
              {t('userMenu.profile')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/sessions">
              <Monitor className="size-4 mr-2" />
              {t('userMenu.sessions')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/settings/ai">
              <Settings className="size-4 mr-2" />
              {t('userMenu.settings')}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun className="size-4" />
            {t('theme', { ns: 'common' })}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <DropdownMenuRadioGroup value={theme} onValueChange={handleThemeChange}>
              <DropdownMenuRadioItem value="system">
                {t('userMenu.themeSystem', { ns: 'app' })}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                {t('userMenu.themeDark', { ns: 'app' })}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="light">
                {t('userMenu.themeLight', { ns: 'app' })}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages className="size-4" />
            {t('language', { ns: 'common' })}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <DropdownMenuRadioGroup value={currentLanguage} onValueChange={handleLanguageChange}>
              <DropdownMenuRadioItem value="zh-CN">
                {t('zh', { ns: 'language' })}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="en-US">
                {t('en', { ns: 'language' })}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onLogout}>
          <LogOut className="size-4 mr-2" />
          {t('userMenu.logOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================================
// Sidebar Component
// ============================================================================

function Sidebar({
  isCollapsed,
  onLogout,
  onToggleCollapse,
}: {
  isCollapsed: boolean;
  onLogout: () => void;
  onToggleCollapse: () => void;
}) {
  const { t } = useTranslation(['app', 'common']);
  const router = useRouter();
  const location = useLocation();
  const storeIsAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const conversationId = useChatPanelStore((s) => s.conversationId);
  const switchConversation = useChatPanelStore((s) => s.switchConversation);
  const startNewConversation = useChatPanelStore((s) => s.startNewConversation);
  const isChatPage = location.pathname === '/chat' || location.pathname.startsWith('/chat/');
  const [chatSearchOpen, setChatSearchOpen] = useState(false);

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const handleSelectConversation = async (
    selectedConversationId: string,
    options?: { focusMessageId?: string; focusKeyword?: string }
  ) => {
    await switchConversation(selectedConversationId, {
      focusMessageId: options?.focusMessageId ?? null,
      focusKeyword: options?.focusKeyword ?? null,
    });
    if (!isChatPage) {
      await router.navigate({ to: '/chat' });
    }
  };

  const handleNewConversation = () => {
    startNewConversation();
    if (!isChatPage) {
      void router.navigate({ to: '/chat' });
    }
  };

  const handleCurrentConversationDeleted = () => {
    startNewConversation();
  };

  const handleOpenChatSearch = () => {
    setChatSearchOpen(true);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setChatSearchOpen(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!storeIsAuthenticated) return null;

  return (
    <aside
      className={cn(
        'flex flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-200',
        isCollapsed ? 'w-14' : 'w-72'
      )}
    >
      {/* Top Bar */}
      <div
        className={cn(
          'flex items-center px-2 pt-2',
          isCollapsed ? 'justify-center' : 'justify-between'
        )}
      >
        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="flex size-9 items-center justify-center rounded-lg hover:bg-muted/70 transition-colors"
                onClick={onToggleCollapse}
              >
                <PanelLeft className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{t('sidebar.expand')}</TooltipContent>
          </Tooltip>
        ) : (
          <>
            <Link
              to="/chat"
              className="flex items-center gap-2 px-2 text-sm font-medium hover:text-foreground/90 transition-colors"
            >
              <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Brain className="size-3.5" />
              </div>
              <span>KnowledgeAgent</span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg"
              onClick={onToggleCollapse}
            >
              <PanelLeftClose className="size-4" />
            </Button>
          </>
        )}
      </div>

      {/* New Chat */}
      {!isCollapsed ? (
        <div className="px-2 pb-1 pt-2">
          <Button className="h-10 w-full justify-start rounded-lg" onClick={handleNewConversation}>
            <Plus className="size-4 mr-2" />
            {t('sidebar.newChat')}
          </Button>
        </div>
      ) : (
        <div className="p-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="icon"
                className="h-9 w-full rounded-lg"
                onClick={handleNewConversation}
              >
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{t('sidebar.newChat')}</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Search */}
      {!isCollapsed ? (
        <div className="px-2 pb-2">
          <Button
            variant="ghost"
            className="h-10 w-full justify-start rounded-lg text-muted-foreground font-normal hover:bg-muted/60"
            onClick={handleOpenChatSearch}
          >
            <Search className="size-4 mr-2" />
            {t('sidebar.searchChat')}
            <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>
        </div>
      ) : (
        <div className="p-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-full h-9"
                onClick={handleOpenChatSearch}
              >
                <Search className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{t('sidebar.searchChat')}</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Workspace Navigation */}
      <div className="px-2 pb-2">
        {!isCollapsed && (
          <p className="px-2 pb-1 text-xs text-muted-foreground">{t('sidebar.workspace')}</p>
        )}
        <nav className={cn('space-y-1', isCollapsed && 'space-y-0')}>
          {mainNavItems.map((item) => (
            <SidebarNavItem
              key={item.to}
              item={item}
              isCollapsed={isCollapsed}
              isActive={isActive(item.to)}
            />
          ))}
        </nav>
      </div>

      {/* Chat History */}
      <div className={cn('flex-1 min-h-0', isCollapsed ? 'p-2' : 'px-2 pb-2')}>
        {isCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={t('sidebar.expand')}
            className="h-full w-full rounded-lg transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="sr-only">{t('sidebar.expand')}</span>
          </button>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="px-2 pb-2 pt-1 text-xs text-muted-foreground">
              {t('sidebar.chatHistory')}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <ConversationList
                knowledgeBaseId={undefined}
                currentConversationId={conversationId}
                onSelect={handleSelectConversation}
                onNewConversation={handleNewConversation}
                onCurrentConversationDeleted={handleCurrentConversationDeleted}
                showNewButton={false}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Section */}
      <div className="border-t p-2">
        {/* User Menu */}
        <UserMenu onLogout={onLogout} isCollapsed={isCollapsed} />
      </div>

      <ChatSearchDialog
        open={chatSearchOpen}
        onOpenChange={setChatSearchOpen}
        currentConversationId={conversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
      />
    </aside>
  );
}

// ============================================================================
// Main Layout Component
// ============================================================================

export function AppLayout({ children, showSidebar = true }: AppLayoutProps) {
  const sidebarCollapsedStorageKey = 'knowledge-agent.sidebar-collapsed';
  const router = useRouter();
  const storeIsAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(sidebarCollapsedStorageKey) === 'true';
  });

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
      localStorage.setItem(sidebarCollapsedStorageKey, String(next));
      return next;
    });
  }, [sidebarCollapsedStorageKey]);

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
        <Sidebar
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
          onLogout={handleLogout}
        />
      )}
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
