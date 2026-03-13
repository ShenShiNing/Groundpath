import { useMemo } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ConversationItem } from './ConversationItem';
import { useConversations, useDeleteConversation } from '@/hooks';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ConversationListItem as ConversationListItemType } from '@knowledge-agent/shared/types';

// ============================================================================
// Types
// ============================================================================

export interface ConversationListProps {
  knowledgeBaseId: string | undefined;
  currentConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onNewConversation: () => void;
  onCurrentConversationDeleted?: () => void;
  showNewButton?: boolean;
}

type GroupLabel =
  | 'conversation.group.today'
  | 'conversation.group.yesterday'
  | 'conversation.group.last7Days'
  | 'conversation.group.last30Days'
  | 'conversation.group.older';

// ============================================================================
// Component
// ============================================================================

export function ConversationList({
  knowledgeBaseId,
  currentConversationId,
  onSelect,
  onNewConversation,
  onCurrentConversationDeleted,
  showNewButton = true,
}: ConversationListProps) {
  const { t } = useTranslation('chat');
  const { data: conversationList, isLoading } = useConversations(knowledgeBaseId);
  const deleteConversation = useDeleteConversation();

  const sortedConversations = useMemo(
    () =>
      [...(conversationList?.items ?? [])].sort(
        (a, b) =>
          new Date(b.lastMessageAt ?? b.createdAt).getTime() -
          new Date(a.lastMessageAt ?? a.createdAt).getTime()
      ),
    [conversationList?.items]
  );

  const handleDelete = async (conversationId: string) => {
    try {
      await deleteConversation.mutateAsync(conversationId);
      // If deleting the current conversation, start a new one
      if (conversationId === currentConversationId) {
        if (onCurrentConversationDeleted) {
          onCurrentConversationDeleted();
        } else {
          onNewConversation();
        }
      }
    } catch {
      toast.error(t('conversation.deleteFailed'));
    }
  };

  const groupedConversations = useMemo(
    () => groupConversationsByTime(sortedConversations),
    [sortedConversations]
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {showNewButton && (
        <div className="p-2 border-b">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={onNewConversation}
          >
            <Plus className="size-4 mr-2" />
            {t('conversation.newConversation')}
          </Button>
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="p-2 space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 text-muted-foreground animate-spin" />
              </div>
            ) : sortedConversations.length > 0 ? (
              groupedConversations.map((group) => (
                <div key={group.label} className="space-y-1">
                  <p className="px-2 text-[11px] text-muted-foreground">{t(group.label)}</p>
                  {group.items.map((conversation) => (
                    <ConversationItem
                      key={conversation.id}
                      conversation={conversation}
                      isActive={conversation.id === currentConversationId}
                      onClick={() => onSelect(conversation.id)}
                      onDelete={() => handleDelete(conversation.id)}
                    />
                  ))}
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-xs text-muted-foreground">
                {t('conversation.empty')}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDayDiffFromToday(date: Date, now: Date): number {
  const todayStart = startOfDay(now).getTime();
  const dateStart = startOfDay(date).getTime();
  return Math.floor((todayStart - dateStart) / (1000 * 60 * 60 * 24));
}

function getGroupLabel(dateValue: string | Date): GroupLabel {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'conversation.group.older';

  const diff = getDayDiffFromToday(date, new Date());
  if (diff <= 0) return 'conversation.group.today';
  if (diff === 1) return 'conversation.group.yesterday';
  if (diff <= 7) return 'conversation.group.last7Days';
  if (diff <= 30) return 'conversation.group.last30Days';
  return 'conversation.group.older';
}

function groupConversationsByTime(conversations: ConversationListItemType[]) {
  const orderedLabels = [
    'conversation.group.today',
    'conversation.group.yesterday',
    'conversation.group.last7Days',
    'conversation.group.last30Days',
    'conversation.group.older',
  ] as const;
  const groups = new Map<GroupLabel, ConversationListItemType[]>();

  conversations.forEach((conversation) => {
    const dateValue = conversation.lastMessageAt ?? conversation.createdAt;
    const label = getGroupLabel(dateValue);
    const existing = groups.get(label) ?? [];
    existing.push(conversation);
    groups.set(label, existing);
  });

  return orderedLabels
    .filter((label) => (groups.get(label)?.length ?? 0) > 0)
    .map((label) => ({
      label,
      items: groups.get(label)!,
    }));
}
