import { useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationApi } from '@/api';
import { queryKeys } from '@/lib/query';
import type { UpdateConversationInput } from '@groundpath/shared/schemas';
import {
  GLOBAL_CONVERSATION_SCOPE,
  removeConversationFromListCache,
  removeConversationFromSearchCaches,
  syncConversationCaches,
  updateConversationListCaches,
} from './conversationCache';

export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) => conversationApi.delete(conversationId),
    onSuccess: (_, conversationId) => {
      updateConversationListCaches(queryClient, (current) =>
        removeConversationFromListCache(current, conversationId)
      );
      removeConversationFromSearchCaches(queryClient, conversationId);
    },
  });
}

export function useUpdateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateConversationInput }) =>
      conversationApi.update(id, data),
    onSuccess: (conversation) => {
      syncConversationCaches(queryClient, conversation);

      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.list(GLOBAL_CONVERSATION_SCOPE),
        exact: true,
      });

      if (conversation.knowledgeBaseId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.list(conversation.knowledgeBaseId),
          exact: true,
        });
      }
    },
  });
}
