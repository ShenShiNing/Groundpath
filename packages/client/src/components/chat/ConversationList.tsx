import { Loader2, Plus } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ConversationItem } from './ConversationItem';
import { useConversations, useDeleteConversation } from '@/hooks';
import { queryKeys } from '@/lib/query';
import { useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();
  const { data: conversations, isLoading } = useConversations(knowledgeBaseId);
  const deleteConversation = useDeleteConversation();

  const sortedConversations = [...(conversations ?? [])].sort(
    (a, b) =>
      new Date(b.lastMessageAt ?? b.createdAt).getTime() -
      new Date(a.lastMessageAt ?? a.createdAt).getTime()
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
      // Invalidate the query to refetch
      queryClient.invalidateQueries({
        queryKey: queryKeys.knowledgeBases.conversations(knowledgeBaseId ?? '__global__'),
      });
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const groupedConversations = groupConversationsByTime(sortedConversations);

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
            新会话
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
                  <p className="px-2 text-[11px] text-muted-foreground">{group.label}</p>
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
              <div className="text-center py-8 text-xs text-muted-foreground">暂无会话</div>
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

function getGroupLabel(dateValue: string | Date): string {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '更早';

  const diff = getDayDiffFromToday(date, new Date());
  if (diff <= 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff <= 7) return '过去 7 天';
  if (diff <= 30) return '过去 30 天';
  return '更早';
}

function groupConversationsByTime(conversations: ConversationListItemType[]) {
  const orderedLabels = ['今天', '昨天', '过去 7 天', '过去 30 天', '更早'] as const;
  const groups = new Map<string, ConversationListItemType[]>();

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
