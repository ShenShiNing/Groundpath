import { useMemo, useState } from 'react';
import { CalendarClock, Loader2, MessageSquare, Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/lib/date';
import { useConversations, useDebouncedValue, useSearchConversations } from '@/hooks';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface ChatSearchDialogProps {
  open: boolean;
  currentConversationId: string | null;
  onOpenChange: (open: boolean) => void;
  onSelectConversation: (
    conversationId: string,
    options?: { focusMessageId?: string; focusKeyword?: string }
  ) => Promise<void> | void;
  onNewConversation: () => void;
}

function formatConversationTime(value: Date | string | null | undefined): string {
  return formatDateTime(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderHighlightedText(text: string, keyword: string) {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) return text;

  const pattern = new RegExp(`(${escapeRegExp(normalizedKeyword)})`, 'ig');
  return text.split(pattern).map((part, index) => {
    if (part.toLowerCase() === normalizedKeyword.toLowerCase()) {
      return (
        <span key={`${part}-${index}`} className="font-semibold text-foreground">
          {part}
        </span>
      );
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

export function ChatSearchDialog({
  open,
  currentConversationId,
  onOpenChange,
  onSelectConversation,
  onNewConversation,
}: ChatSearchDialogProps) {
  const { t } = useTranslation(['app', 'chat']);
  const [keyword, setKeyword] = useState('');
  const normalizedKeyword = keyword.trim();
  const debouncedKeyword = useDebouncedValue(normalizedKeyword, 300);
  const isContentSearch = debouncedKeyword.length >= 2;

  const { data: conversationList, isLoading: isConversationLoading } = useConversations(undefined);
  const {
    data: searchResult,
    isLoading: isSearchLoading,
    isFetching: isSearchFetching,
  } = useSearchConversations(debouncedKeyword, {
    enabled: open && isContentSearch,
    limit: 20,
    offset: 0,
  });

  const sortedConversations = useMemo(
    () =>
      [...(conversationList?.items ?? [])].sort(
        (a, b) =>
          new Date(b.lastMessageAt ?? b.createdAt).getTime() -
          new Date(a.lastMessageAt ?? a.createdAt).getTime()
      ),
    [conversationList?.items]
  );
  const searchItems = searchResult?.items ?? [];
  const isLoading = isContentSearch ? isSearchLoading || isSearchFetching : isConversationLoading;

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setKeyword('');
    }
  };

  const handleSelectConversation = async (
    conversationId: string,
    focusMessageId?: string,
    focusKeyword?: string
  ) => {
    const normalizedKeyword = focusKeyword?.trim();
    await onSelectConversation(conversationId, {
      focusMessageId: focusMessageId ?? undefined,
      focusKeyword: normalizedKeyword ? normalizedKeyword : undefined,
    });
    handleOpenChange(false);
  };

  const handleCreateConversation = () => {
    onNewConversation();
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{t('sidebar.searchChat')}</DialogTitle>
          <DialogDescription>{t('sidebar.searchChatDescription')}</DialogDescription>
        </DialogHeader>

        <div className="border-b px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={t('sidebar.searchPlaceholder')}
              className="pl-9"
              autoFocus
            />
          </div>
          <Button onClick={handleCreateConversation} className="mt-3 w-full">
            <Plus className="mr-2 size-4" />
            {t('conversation.newConversation', { ns: 'chat' })}
          </Button>
        </div>

        <ScrollArea className="h-[min(56vh,480px)]">
          <div className="space-y-1 p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                <span className="text-sm">{t('sidebar.searchLoading')}</span>
              </div>
            ) : isContentSearch && searchItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-12 text-center text-muted-foreground">
                <MessageSquare className="mb-2 size-5" />
                <p className="text-sm">{t('sidebar.searchEmpty')}</p>
              </div>
            ) : isContentSearch ? (
              searchItems.map((item) => {
                const messageTime = formatConversationTime(item.matchedAt);
                return (
                  <button
                    key={item.messageId}
                    type="button"
                    className={cn(
                      'flex w-full cursor-pointer items-center rounded-lg px-3 py-2 text-left transition-colors',
                      item.conversationId === currentConversationId
                        ? 'bg-muted text-foreground'
                        : 'text-foreground hover:bg-muted/60'
                    )}
                    onClick={() =>
                      void handleSelectConversation(
                        item.conversationId,
                        item.messageId,
                        debouncedKeyword
                      )
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.conversationTitle}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {renderHighlightedText(item.snippet, debouncedKeyword)}
                      </p>
                      {messageTime ? (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CalendarClock className="size-3.5" />
                          {messageTime}
                        </p>
                      ) : null}
                    </div>
                  </button>
                );
              })
            ) : sortedConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-12 text-center text-muted-foreground">
                <MessageSquare className="mb-2 size-5" />
                <p className="text-sm">{t('conversation.empty', { ns: 'chat' })}</p>
              </div>
            ) : (
              sortedConversations.map((conversation) => {
                const messageTime = formatConversationTime(
                  conversation.lastMessageAt ?? conversation.createdAt
                );
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    className={cn(
                      'flex w-full cursor-pointer items-center rounded-lg px-3 py-2 text-left transition-colors',
                      conversation.id === currentConversationId
                        ? 'bg-muted text-foreground'
                        : 'text-foreground hover:bg-muted/60'
                    )}
                    onClick={() => void handleSelectConversation(conversation.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {conversation.title || t('conversation.untitled', { ns: 'chat' })}
                      </p>
                      {messageTime ? (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CalendarClock className="size-3.5" />
                          {messageTime}
                        </p>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
