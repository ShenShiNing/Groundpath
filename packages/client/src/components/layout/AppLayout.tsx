import { useState, useCallback } from 'react';
import { Link, useRouter, useLocation } from '@tanstack/react-router';
import {
  Brain,
  LogOut,
  PanelLeft,
  PanelLeftClose,
  LayoutDashboard,
  MessageSquare,
  User,
  Settings,
  Monitor,
  Database,
  ChevronDown,
  Search,
  Plus,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LanguageToggle } from '@/components/i18n/LanguageToggle';
import { ModeToggle } from '@/components/theme/mode-toggle';
import { useTranslation } from 'react-i18next';
import { ConversationList } from '@/components/chat';
import { useAuthStore, useChatPanelStore } from '@/stores';
import { authApi } from '@/api';

// ============================================================================
// Types
// ============================================================================

interface AppLayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
}

type NavItemLabelKey = 'nav.dashboard' | 'nav.knowledgeBases';

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
  const { t } = useTranslation('app');
  const label = String(t(item.labelKey));
  const content = (
    <Link
      to={item.to}
      className={cn(
        'flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors',
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
  const { t } = useTranslation(['app', 'common']);
  const { user } = useAuthStore();
  const userInitials = getUserInitials(user?.username, user?.email);
  const displayName = user?.username ?? t('user', { ns: 'common' });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm transition-colors',
            'hover:bg-accent text-left'
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
            <Link to={'/knowledge-bases' as string}>
              <Plus className="size-4 mr-2" />
              {t('userMenu.newKnowledgeBase')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to={'/profile' as string}>
              <User className="size-4 mr-2" />
              {t('userMenu.profile')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to={'/settings/ai' as string}>
              <Settings className="size-4 mr-2" />
              {t('userMenu.settings')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to={'/sessions' as string}>
              <Monitor className="size-4 mr-2" />
              {t('userMenu.sessions')}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
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
  const { accessToken } = useAuthStore();
  const { conversationId, switchConversation, startNewConversation } = useChatPanelStore();
  const isAuthenticated = !!accessToken;
  const isChatPage = location.pathname === '/chat' || location.pathname.startsWith('/chat/');

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const handleSelectConversation = (selectedConversationId: string) => {
    void (async () => {
      await switchConversation(selectedConversationId);
      if (!isChatPage) {
        await router.navigate({ to: '/chat' });
      }
    })();
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

  if (!isAuthenticated) return null;

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
              <Button variant="ghost" size="icon" className="w-full h-9">
                <Search className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{t('sidebar.searchChat')}</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Workspace Navigation */}
      <div className={cn('px-2 pb-2', isCollapsed && 'px-1')}>
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="w-full h-9 rounded-lg" asChild>
                <Link to="/chat">
                  <MessageSquare className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{t('sidebar.chatHistory')}</TooltipContent>
          </Tooltip>
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
        {/* Theme Toggle */}
        <div className={cn('flex items-center mb-2', isCollapsed ? 'justify-center' : 'px-1')}>
          {isCollapsed ? (
            <ModeToggle />
          ) : (
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-muted-foreground px-2">
                {t('theme', { ns: 'common' })}
              </span>
              <ModeToggle />
            </div>
          )}
        </div>
        <div className={cn('flex items-center mb-2', isCollapsed ? 'justify-center' : 'px-1')}>
          {isCollapsed ? (
            <LanguageToggle compact />
          ) : (
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-muted-foreground px-2">
                {t('language', { ns: 'common' })}
              </span>
              <LanguageToggle />
            </div>
          )}
        </div>

        {/* User Menu */}
        <UserMenu onLogout={onLogout} isCollapsed={isCollapsed} />
      </div>
    </aside>
  );
}

// ============================================================================
// Main Layout Component
// ============================================================================

export function AppLayout({ children, showSidebar = true }: AppLayoutProps) {
  const router = useRouter();
  const { accessToken, isAuthenticated: storeIsAuthenticated, clearAuth } = useAuthStore();
  const isAuthenticated = !!accessToken;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
    setSidebarCollapsed((prev) => !prev);
  }, []);

  // Non-authenticated layout (landing pages, auth pages)
  if (!isAuthenticated) {
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
