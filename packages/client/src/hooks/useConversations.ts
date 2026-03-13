import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { conversationApi } from '@/api';
import { queryKeys } from '@/lib/query';
import type {
  ConversationInfo,
  ConversationListResponse,
  ConversationSearchResponse,
} from '@knowledge-agent/shared/types';
import type { UpdateConversationInput } from '@knowledge-agent/shared/schemas';

const GLOBAL_CONVERSATION_SCOPE = '__global__';
const CONVERSATION_LIST_STALE_TIME_MS = 30 * 1000;
const CONVERSATION_SEARCH_STALE_TIME_MS = 30 * 1000;

// ============================================================================
// Cache helpers
// ============================================================================

function getConversationScopeKey(knowledgeBaseId: string | undefined) {
  return knowledgeBaseId ?? GLOBAL_CONVERSATION_SCOPE;
}

function isConversationListQueryKey(
  queryKey: QueryKey
): queryKey is ReturnType<typeof queryKeys.conversations.list> {
  return (
    Array.isArray(queryKey) &&
    queryKey[0] === 'conversations' &&
    queryKey[1] === 'list' &&
    typeof queryKey[2] === 'string'
  );
}

function removeConversationFromListCache(
  current: ConversationListResponse,
  conversationId: string
): ConversationListResponse {
  const items = current.items.filter((conversation) => conversation.id !== conversationId);
  if (items.length === current.items.length) {
    return current;
  }

  return {
    ...current,
    items,
    pagination: {
      ...current.pagination,
      total: Math.max(0, current.pagination.total - (current.items.length - items.length)),
    },
  };
}

function updateConversationListItemCache(
  current: ConversationListResponse,
  scopeKey: string,
  conversation: ConversationInfo
): ConversationListResponse {
  const nextItems = current.items.reduce<typeof current.items>((items, existing) => {
    if (existing.id !== conversation.id) {
      items.push(existing);
      return items;
    }

    if (
      scopeKey !== GLOBAL_CONVERSATION_SCOPE &&
      scopeKey !== (conversation.knowledgeBaseId ?? GLOBAL_CONVERSATION_SCOPE)
    ) {
      return items;
    }

    items.push({
      ...existing,
      title: conversation.title,
      knowledgeBaseId: conversation.knowledgeBaseId,
    });
    return items;
  }, []);

  if (nextItems.length === current.items.length) {
    const itemChanged = nextItems.some((item, index) => item !== current.items[index]);
    return itemChanged ? { ...current, items: nextItems } : current;
  }

  return {
    ...current,
    items: nextItems,
    pagination: {
      ...current.pagination,
      total: Math.max(0, current.pagination.total - (current.items.length - nextItems.length)),
    },
  };
}

function updateConversationSearchCache(
  current: ConversationSearchResponse,
  conversation: ConversationInfo
): ConversationSearchResponse {
  const items = current.items.map((item) =>
    item.conversationId === conversation.id
      ? {
          ...item,
          conversationTitle: conversation.title,
          knowledgeBaseId: conversation.knowledgeBaseId,
        }
      : item
  );

  const changed = items.some((item, index) => item !== current.items[index]);
  return changed ? { ...current, items } : current;
}

function updateConversationListCaches(
  queryClient: QueryClient,
  updater: (current: ConversationListResponse, scopeKey: string) => ConversationListResponse
) {
  for (const [queryKey, current] of queryClient.getQueriesData<ConversationListResponse>({
    queryKey: queryKeys.conversations.lists(),
  })) {
    if (!current || !isConversationListQueryKey(queryKey)) {
      continue;
    }

    const next = updater(current, queryKey[2]);
    if (next !== current) {
      queryClient.setQueryData(queryKey, next);
    }
  }
}

function removeConversationFromSearchCaches(queryClient: QueryClient, conversationId: string) {
  queryClient.setQueriesData<ConversationSearchResponse>(
    { queryKey: queryKeys.conversations.searches() },
    (current) => {
      if (!current) {
        return current;
      }

      const items = current.items.filter((item) => item.conversationId !== conversationId);
      if (items.length === current.items.length) {
        return current;
      }

      return {
        ...current,
        items,
        pagination: {
          ...current.pagination,
          total: Math.max(0, current.pagination.total - (current.items.length - items.length)),
        },
      };
    }
  );
}

function syncConversationCaches(queryClient: QueryClient, conversation: ConversationInfo) {
  updateConversationListCaches(queryClient, (current, scopeKey) =>
    updateConversationListItemCache(current, scopeKey, conversation)
  );

  queryClient.setQueriesData<ConversationSearchResponse>(
    { queryKey: queryKeys.conversations.searches() },
    (current) => (current ? updateConversationSearchCache(current, conversation) : current)
  );
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Fetch conversations for a knowledge base
 */
export function useConversations(knowledgeBaseId: string | undefined) {
  const scopeKey = getConversationScopeKey(knowledgeBaseId);

  return useQuery<ConversationListResponse>({
    queryKey: queryKeys.conversations.list(scopeKey),
    queryFn: () =>
      conversationApi.list(
        scopeKey === GLOBAL_CONVERSATION_SCOPE ? undefined : { knowledgeBaseId: scopeKey }
      ),
    staleTime: CONVERSATION_LIST_STALE_TIME_MS,
  });
}

/**
 * Search conversations by message content
 */
export function useSearchConversations(
  query: string,
  options?: {
    knowledgeBaseId?: string;
    limit?: number;
    offset?: number;
    enabled?: boolean;
  }
) {
  const normalizedQuery = query.trim();
  const enabled = options?.enabled ?? true;

  return useQuery<ConversationSearchResponse>({
    queryKey: queryKeys.conversations.search({
      query: normalizedQuery,
      knowledgeBaseId: options?.knowledgeBaseId,
      limit: options?.limit ?? 20,
      offset: options?.offset ?? 0,
    }),
    queryFn: () =>
      conversationApi.search({
        query: normalizedQuery,
        knowledgeBaseId: options?.knowledgeBaseId,
        limit: options?.limit ?? 20,
        offset: options?.offset ?? 0,
      }),
    enabled: enabled && normalizedQuery.length >= 2,
    staleTime: CONVERSATION_SEARCH_STALE_TIME_MS,
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
    onSuccess: (_, conversationId) => {
      updateConversationListCaches(queryClient, (current) =>
        removeConversationFromListCache(current, conversationId)
      );
      removeConversationFromSearchCaches(queryClient, conversationId);
    },
  });
}

/**
 * Update conversation title
 */
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
