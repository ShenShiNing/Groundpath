import { useQuery } from '@tanstack/react-query';
import { conversationApi } from '@/api';
import { queryKeys } from '@/lib/query';
import type {
  ConversationListResponse,
  ConversationSearchResponse,
} from '@groundpath/shared/types';
import { GLOBAL_CONVERSATION_SCOPE, getConversationScopeKey } from './conversationCache';

const CONVERSATION_LIST_STALE_TIME_MS = 30 * 1000;
const CONVERSATION_SEARCH_STALE_TIME_MS = 30 * 1000;

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
