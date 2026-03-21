import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query';
import type {
  ConversationInfo,
  ConversationListResponse,
  ConversationSearchResponse,
} from '@knowledge-agent/shared/types';

const GLOBAL_CONVERSATION_SCOPE = '__global__';

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

export {
  GLOBAL_CONVERSATION_SCOPE,
  getConversationScopeKey,
  removeConversationFromListCache,
  removeConversationFromSearchCaches,
  syncConversationCaches,
  updateConversationListCaches,
};
