import { useState, useCallback } from 'react';
import { Link, useRouter, useLocation } from '@tanstack/react-router';
import {
  Brain,
  LogOut,
  PanelLeftClose,
  PanelLeft,
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
import { Separator } from '@/components/ui/separator';
import { ModeToggle } from '@/components/theme/mode-toggle';
import { useAuthStore } from '@/stores';
import { authApi } from '@/api';

// ============================================================================
// Types
// ============================================================================

interface AppLayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
}

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
}

// ============================================================================
// Constants
// ============================================================================

const mainNavItems: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: <LayoutDashboard className="size-4" /> },
  { label: 'Knowledge Bases', to: '/knowledge-bases', icon: <Database className="size-4" /> },
  { label: 'Chat', to: '/chat', icon: <MessageSquare className="size-4" /> },
];

// ============================================================================
// Utility Functions
// ============================================================================

function getUserInitials(username?: string, email?: string): string {
  if (username) return username.slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return 'U';
}

function getUserDisplayName(username?: string): string {
  return username ?? 'User';
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
  const content = (
    <Link
      to={item.to}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
        'hover:bg-accent',
        isActive
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {item.icon}
      {!isCollapsed && <span>{item.label}</span>}
    </Link>
  );

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

// ============================================================================
// User Menu Component
// ============================================================================

function UserMenu({ onLogout, isCollapsed }: { onLogout: () => void; isCollapsed: boolean }) {
  const { user } = useAuthStore();
  const userInitials = getUserInitials(user?.username, user?.email);
  const displayName = getUserDisplayName(user?.username);

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
            <Link to={'/profile' as string}>
              <User className="size-4 mr-2" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to={'/settings' as string}>
              <Settings className="size-4 mr-2" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to={'/sessions' as string}>
              <Monitor className="size-4 mr-2" />
              Sessions
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onLogout}>
          <LogOut className="size-4 mr-2" />
          Log out
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
  onToggleCollapse,
  onLogout,
}: {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onLogout: () => void;
}) {
  const location = useLocation();
  const { accessToken } = useAuthStore();
  const isAuthenticated = !!accessToken;

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  if (!isAuthenticated) return null;

  return (
    <aside
      className={cn(
        'flex flex-col border-r bg-background transition-all duration-200',
        isCollapsed ? 'w-13' : 'w-60'
      )}
    >
      {/* Logo & Collapse Toggle */}
      <div className="flex items-center justify-between h-14 px-3 border-b">
        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="group/logo flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground mx-auto cursor-pointer hover:opacity-80 transition-opacity"
                onClick={onToggleCollapse}
              >
                <Brain className="size-4 group-hover/logo:hidden" />
                <PanelLeft className="size-4 hidden group-hover/logo:block" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand sidebar</TooltipContent>
          </Tooltip>
        ) : (
          <>
            <Link
              to="/dashboard"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Brain className="size-4" />
              </div>
              <span className="font-semibold text-sm">KnowledgeAgent</span>
            </Link>
            <Button variant="ghost" size="icon" className="size-7" onClick={onToggleCollapse}>
              <PanelLeftClose className="size-4" />
            </Button>
          </>
        )}
      </div>

      {/* Search (collapsed: icon only) */}
      {!isCollapsed ? (
        <div className="p-3">
          <Button
            variant="outline"
            className="w-full justify-start text-muted-foreground font-normal"
          >
            <Search className="size-4 mr-2" />
            Search...
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
            <TooltipContent side="right">Search</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Quick Actions */}
      {!isCollapsed ? (
        <div className="px-3 pb-3">
          <Button variant="default" size="sm" className="w-full" asChild>
            <Link to="/knowledge-bases">
              <Plus className="size-4 mr-2" />
              New Knowledge Base
            </Link>
          </Button>
        </div>
      ) : (
        <div className="px-2 pb-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="default" size="icon" className="w-full h-9" asChild>
                <Link to="/knowledge-bases">
                  <Plus className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New Knowledge Base</TooltipContent>
          </Tooltip>
        </div>
      )}

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {mainNavItems.map((item) => (
          <SidebarNavItem
            key={item.to}
            item={item}
            isCollapsed={isCollapsed}
            isActive={isActive(item.to)}
          />
        ))}
      </nav>

      {/* Bottom Section */}
      <div className="mt-auto border-t p-2">
        {/* Theme Toggle */}
        <div className={cn('flex items-center mb-2', isCollapsed ? 'justify-center' : 'px-1')}>
          {isCollapsed ? (
            <ModeToggle />
          ) : (
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-muted-foreground px-2">Theme</span>
              <ModeToggle />
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
