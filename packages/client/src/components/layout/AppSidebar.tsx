import { useEffect, useState } from 'react';
import { Link, useLocation, useRouter } from '@tanstack/react-router';
import {
  Brain,
  PanelLeft,
  PanelLeftClose,
  LayoutDashboard,
  Database,
  Trash2,
  Search,
  Plus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ChatSearchDialog, ConversationList } from '@/components/chat';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAuthStore, useChatPanelStore } from '@/stores';
import { UserMenu } from './UserMenu';

type NavItemLabelKey = 'nav.dashboard' | 'nav.knowledgeBases' | 'nav.trash';

interface NavItem {
  labelKey: NavItemLabelKey;
  to: string;
  icon: React.ReactNode;
}

interface AppSidebarProps {
  isCollapsed: boolean;
  onLogout: () => void;
  onToggleCollapse: () => void;
}

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

export function AppSidebar({ isCollapsed, onLogout, onToggleCollapse }: AppSidebarProps) {
  const { t } = useTranslation(['app', 'common']);
  const router = useRouter();
  const location = useLocation();
  const storeIsAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const conversationId = useChatPanelStore((state) => state.conversationId);
  const switchConversation = useChatPanelStore((state) => state.switchConversation);
  const startNewConversation = useChatPanelStore((state) => state.startNewConversation);
  const isChatPage = location.pathname === '/chat' || location.pathname.startsWith('/chat/');
  const [chatSearchOpen, setChatSearchOpen] = useState(false);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

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
        'flex flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-200',
        isCollapsed ? 'w-14' : 'w-72'
      )}
    >
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
              className="flex items-center gap-2 px-2 text-sm font-medium transition-colors hover:text-foreground/90"
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

      {!isCollapsed ? (
        <div className="px-2 pb-1 pt-2">
          <Button className="h-10 w-full justify-start rounded-lg" onClick={handleNewConversation}>
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

      {!isCollapsed ? (
        <div className="px-2 pb-2">
          <Button
            variant="ghost"
            className="h-10 w-full justify-start rounded-lg font-normal text-muted-foreground hover:bg-muted/60"
            onClick={() => setChatSearchOpen(true)}
          >
            <Search className="mr-2 size-4" />
            {t('sidebar.searchChat')}
            <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
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

      <div className={cn('min-h-0 flex-1', isCollapsed ? 'p-2' : 'px-2 pb-2')}>
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

      <div className="border-t p-2">
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
