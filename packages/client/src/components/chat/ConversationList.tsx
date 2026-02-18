import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ConversationItem } from './ConversationItem';
import { useConversations, useDeleteConversation } from '@/hooks';
import { queryKeys } from '@/lib/query';
import { useQueryClient } from '@tanstack/react-query';

// ============================================================================
// Types
// ============================================================================

export interface ConversationListProps {
  knowledgeBaseId: string | undefined;
  currentConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onNewConversation: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function ConversationList({
  knowledgeBaseId,
  currentConversationId,
  onSelect,
  onNewConversation,
}: ConversationListProps) {
  const queryClient = useQueryClient();
  const { data: conversations, isLoading } = useConversations(knowledgeBaseId);
  const deleteConversation = useDeleteConversation();

  const handleDelete = async (conversationId: string) => {
    try {
      await deleteConversation.mutateAsync(conversationId);
      // If deleting the current conversation, start a new one
      if (conversationId === currentConversationId) {
        onNewConversation();
      }
      // Invalidate the query to refetch
      if (knowledgeBaseId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.knowledgeBases.conversations(knowledgeBaseId),
        });
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* New conversation button */}
      <div className="p-2 border-b shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={onNewConversation}
        >
          <Plus className="size-4" />
          New Chat
        </Button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="p-2 space-y-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 text-muted-foreground animate-spin" />
              </div>
            ) : conversations && conversations.length > 0 ? (
              conversations.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isActive={conversation.id === currentConversationId}
                  onClick={() => onSelect(conversation.id)}
                  onDelete={() => handleDelete(conversation.id)}
                />
              ))
            ) : (
              <div className="text-center py-8 text-xs text-muted-foreground">
                No conversations yet
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
