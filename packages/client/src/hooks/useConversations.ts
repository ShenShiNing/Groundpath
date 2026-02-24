import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationApi } from '@/api/chat';
import { queryKeys } from '@/lib/query';
import type { ConversationListItem } from '@knowledge-agent/shared/types';

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Fetch conversations for a knowledge base
 */
export function useConversations(knowledgeBaseId: string | undefined) {
  const scopeKey = knowledgeBaseId ?? '__global__';
  return useQuery<ConversationListItem[]>({
    queryKey: queryKeys.knowledgeBases.conversations(scopeKey),
    queryFn: () =>
      conversationApi.list(scopeKey === '__global__' ? undefined : { knowledgeBaseId: scopeKey }),
    enabled: true,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Delete a conversation
 */
export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) => conversationApi.delete(conversationId),
    onSuccess: () => {
      // Invalidate all conversation queries
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey.includes('knowledgeBases') &&
          query.queryKey.includes('conversations'),
      });
    },
  });
}

/**
 * Update conversation title
 */
export function useUpdateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      conversationApi.update(id, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey.includes('knowledgeBases') &&
          query.queryKey.includes('conversations'),
      });
    },
  });
}
