import { useEffect, useState } from 'react';
import { Link, useLocation, useRouter } from '@tanstack/react-router';
import { Brain, PanelLeft, PanelLeftClose, Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ChatSearchDialog, ConversationList } from '@/components/chat';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAuthStore, useChatPanelStore } from '@/stores';
import { matchesNavPath, sidebarNavItems, type AppNavItem } from './appNavigation';
import { UserMenu } from './UserMenu';

interface AppSidebarProps {
  isCollapsed: boolean;
  onLogout: () => void;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  variant?: 'desktop' | 'mobile';
}

function SidebarNavItem({
  item,
  isCollapsed,
  isActive,
  onNavigate,
}: {
  item: AppNavItem;
  isCollapsed: boolean;
  isActive: boolean;
  onNavigate?: () => void;
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
      onClick={onNavigate}
      className={cn(
        'flex items-center rounded-xl text-sm transition-colors',
        isCollapsed ? 'h-9 w-full justify-center px-0 py-0' : 'gap-2 px-2.5 py-2',
        isActive
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-background/80 hover:text-foreground'
      )}
    >
      <item.icon className="size-4" />
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

export function AppSidebar({
  isCollapsed,
  onLogout,
  onToggleCollapse,
  onNavigate,
  variant = 'desktop',
}: AppSidebarProps) {
  const { t } = useTranslation(['app', 'common']);
  const router = useRouter();
  const location = useLocation();
  const storeIsAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const conversationId = useChatPanelStore((state) => state.conversationId);
  const switchConversation = useChatPanelStore((state) => state.switchConversation);
  const startNewConversation = useChatPanelStore((state) => state.startNewConversation);
  const isChatPage = location.pathname === '/chat' || location.pathname.startsWith('/chat/');
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const isDesktop = variant === 'desktop';
  const collapsed = isDesktop && isCollapsed;

  const handleNavigate = () => {
    onNavigate?.();
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
    onNavigate?.();
  };

  const handleNewConversation = () => {
    startNewConversation();
    if (!isChatPage) {
      void router.navigate({ to: '/chat' });
    }
    onNavigate?.();
  };

  const handleCurrentConversationDeleted = () => {
    startNewConversation();
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

  if (!storeIsAuthenticated) {
    return null;
  }

  return (
    <aside
      className={cn(
        'flex min-h-0 flex-col text-foreground',
        isDesktop
          ? cn(
              'h-full border-r border-border/60 bg-[#f7f7f8] transition-[width] duration-200 dark:bg-[#171717]',
              collapsed ? 'w-14' : 'w-72'
            )
          : 'h-full bg-[#f7f7f8] dark:bg-[#171717]'
      )}
    >
      <div
        className={cn(
          'flex items-center',
          isDesktop
            ? cn('px-2 pt-2', collapsed ? 'justify-center' : 'justify-between')
            : 'border-b px-4 pb-3 pt-4 pr-12'
        )}
      >
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="flex size-9 items-center justify-center rounded-lg transition-colors hover:bg-muted/70"
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
              onClick={handleNavigate}
              className={cn(
                'flex items-center gap-2 text-sm font-medium transition-colors hover:text-foreground/90',
                isDesktop ? 'px-2' : 'min-w-0 flex-1'
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-center rounded-xl bg-[#10a37f] text-white',
                  isDesktop ? 'size-6' : 'size-10'
                )}
              >
                <Brain className={cn(isDesktop ? 'size-3.5' : 'size-5')} />
              </div>
              <div className="min-w-0">
                <p className="truncate">{t('brand', { ns: 'common' })}</p>
                {!isDesktop && (
                  <p className="truncate text-xs font-normal text-muted-foreground">
                    {t('mobile.navigationDescription')}
                  </p>
                )}
              </div>
            </Link>
            {isDesktop && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-lg"
                onClick={onToggleCollapse}
              >
                <PanelLeftClose className="size-4" />
              </Button>
            )}
          </>
        )}
      </div>

      {!collapsed ? (
        <div className={cn(isDesktop ? 'px-2 pb-1 pt-2' : 'px-4 pb-2 pt-4')}>
          <Button
            variant="outline"
            className="h-10 w-full justify-start rounded-xl border-border/70 bg-background shadow-sm hover:bg-background"
            onClick={handleNewConversation}
          >
            <Plus className="mr-2 size-4" />
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

      {!collapsed ? (
        <div className={cn(isDesktop ? 'px-2 pb-2' : 'px-4 pb-4')}>
          <Button
            variant="ghost"
            className="h-10 w-full justify-start rounded-xl border border-transparent bg-background/65 font-normal text-muted-foreground hover:bg-background"
            onClick={() => setChatSearchOpen(true)}
          >
            <Search className="mr-2 size-4" />
            {t('sidebar.searchChat')}
            {isDesktop && (
              <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                <span className="text-xs">⌘</span>K
              </kbd>
            )}
          </Button>
        </div>
      ) : (
        <div className="p-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-full"
                onClick={() => setChatSearchOpen(true)}
              >
                <Search className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{t('sidebar.searchChat')}</TooltipContent>
          </Tooltip>
        </div>
      )}

      <div className={cn(isDesktop ? 'px-2 pb-2' : 'px-4 pb-3')}>
        {!collapsed && (
          <p className="px-2 pb-1 text-xs text-muted-foreground">{t('sidebar.workspace')}</p>
        )}
        <nav className={cn('space-y-1', collapsed && 'space-y-0')}>
          {sidebarNavItems.map((item) => (
            <SidebarNavItem
              key={item.to}
              item={item}
              isCollapsed={collapsed}
              isActive={matchesNavPath(location.pathname, item.to)}
              onNavigate={handleNavigate}
            />
          ))}
        </nav>
      </div>

      <div
        className={cn(
          'min-h-0 flex-1',
          collapsed ? 'p-2' : isDesktop ? 'px-2 pb-2' : 'px-4 pb-4'
        )}
      >
        {collapsed ? (
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
            <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/60 bg-background/70">
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

      <div className={cn('border-t', isDesktop ? 'p-2' : 'px-4 py-3')}>
        <UserMenu onLogout={onLogout} isCollapsed={collapsed} />
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
