import React, { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ConversationInfo,
  ConversationListResponse,
  ConversationSearchResponse,
} from '@groundpath/shared/types';
import {
  useConversations,
  useDeleteConversation,
  useSearchConversations,
  useUpdateConversation,
} from '@/hooks/useConversations';
import { queryKeys } from '@/lib/query';
import { flushPromises, render } from '../utils/render';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  search: vi.fn(),
  update: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    conversationApi: {
      ...actual.conversationApi,
      list: mocks.list,
      search: mocks.search,
      update: mocks.update,
      delete: mocks.deleteConversation,
    },
  };
});

const conversationFixture: ConversationInfo = {
  id: 'conv-1',
  userId: 'user-1',
  knowledgeBaseId: 'kb-1',
  title: 'Initial conversation',
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  updatedAt: new Date('2026-03-02T00:00:00.000Z'),
};

const conversationListFixture: ConversationListResponse = {
  items: [
    {
      id: conversationFixture.id,
      title: conversationFixture.title,
      knowledgeBaseId: conversationFixture.knowledgeBaseId,
      messageCount: 2,
      lastMessageAt: new Date('2026-03-02T00:00:00.000Z'),
      createdAt: conversationFixture.createdAt,
    },
  ],
  pagination: {
    limit: 20,
    offset: 0,
    total: 1,
    hasMore: false,
  },
};

const conversationSearchFixture: ConversationSearchResponse = {
  items: [
    {
      conversationId: conversationFixture.id,
      conversationTitle: conversationFixture.title,
      knowledgeBaseId: conversationFixture.knowledgeBaseId,
      messageId: 'msg-1',
      role: 'user',
      snippet: 'Initial conversation content',
      matchedAt: new Date('2026-03-02T00:00:00.000Z'),
      score: 0.95,
    },
  ],
  pagination: {
    limit: 20,
    offset: 0,
    total: 1,
    hasMore: false,
  },
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

async function waitFor(condition: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await flushPromises();
    if (condition()) {
      return;
    }
  }

  throw new Error('Condition was not met');
}

async function renderWithClient(client: QueryClient, ui: React.ReactElement) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function getQueryStaleTime(queryClient: QueryClient, queryKey: readonly unknown[]) {
  const options = queryClient.getQueryCache().find({ queryKey })?.options as
    | { staleTime?: number }
    | undefined;

  return options?.staleTime;
}

describe('useConversations hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue(conversationListFixture);
    mocks.search.mockResolvedValue(conversationSearchFixture);
  });

  it('should apply explicit staleTime values for conversation list and search queries', async () => {
    const queryClient = createQueryClient();
    const searchParams = {
      query: 'alpha',
      knowledgeBaseId: undefined,
      limit: 20,
      offset: 0,
    };

    function QueryProbe() {
      useConversations(undefined);
      useSearchConversations('alpha');
      return null;
    }

    const view = await renderWithClient(queryClient, <QueryProbe />);

    await waitFor(
      () =>
        queryClient.getQueryData(queryKeys.conversations.list('__global__')) !== undefined &&
        queryClient.getQueryData(queryKeys.conversations.search(searchParams)) !== undefined
    );

    expect(getQueryStaleTime(queryClient, queryKeys.conversations.list('__global__'))).toBe(30_000);
    expect(getQueryStaleTime(queryClient, queryKeys.conversations.search(searchParams))).toBe(
      30_000
    );

    await view.unmount();
  });

  it('should sync updated conversations across caches and invalidate only exact list keys', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const updatedConversation: ConversationInfo = {
      ...conversationFixture,
      title: 'Renamed conversation',
      updatedAt: new Date('2026-03-05T00:00:00.000Z'),
    };

    mocks.update.mockResolvedValue(updatedConversation);
    queryClient.setQueryData(queryKeys.conversations.list('__global__'), conversationListFixture);
    queryClient.setQueryData(
      queryKeys.conversations.list(conversationFixture.knowledgeBaseId ?? '__global__'),
      conversationListFixture
    );
    queryClient.setQueryData(
      queryKeys.conversations.search({
        query: 'alpha',
        knowledgeBaseId: undefined,
        limit: 20,
        offset: 0,
      }),
      conversationSearchFixture
    );

    const mutationRef: {
      current?: {
        updateConversation: ReturnType<typeof useUpdateConversation>;
      };
    } = {};

    function MutationProbe({
      onReady,
    }: {
      onReady: (mutation: { updateConversation: ReturnType<typeof useUpdateConversation> }) => void;
    }) {
      const updateConversation = useUpdateConversation();

      React.useEffect(() => {
        onReady({ updateConversation });
      }, [onReady, updateConversation]);

      return null;
    }

    const view = await renderWithClient(
      queryClient,
      <MutationProbe
        onReady={(mutation) => {
          mutationRef.current = mutation;
        }}
      />
    );

    await waitFor(() => mutationRef.current !== undefined);

    await act(async () => {
      await mutationRef.current?.updateConversation.mutateAsync({
        id: conversationFixture.id,
        data: { title: updatedConversation.title },
      });
    });

    expect(
      queryClient.getQueryData<ConversationListResponse>(queryKeys.conversations.list('__global__'))
        ?.items[0]?.title
    ).toBe(updatedConversation.title);
    expect(
      queryClient.getQueryData<ConversationListResponse>(
        queryKeys.conversations.list(conversationFixture.knowledgeBaseId ?? '__global__')
      )?.items[0]?.title
    ).toBe(updatedConversation.title);
    expect(
      queryClient.getQueryData<ConversationSearchResponse>(
        queryKeys.conversations.search({
          query: 'alpha',
          knowledgeBaseId: undefined,
          limit: 20,
          offset: 0,
        })
      )?.items[0]?.conversationTitle
    ).toBe(updatedConversation.title);
    expect(invalidateSpy.mock.calls.map(([query]) => query)).toEqual([
      {
        queryKey: queryKeys.conversations.list('__global__'),
        exact: true,
      },
      {
        queryKey: queryKeys.conversations.list(conversationFixture.knowledgeBaseId ?? '__global__'),
        exact: true,
      },
    ]);

    await view.unmount();
  });

  it('should remove deleted conversations from cached lists and search results without invalidating queries', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    mocks.deleteConversation.mockResolvedValue(undefined);
    queryClient.setQueryData(queryKeys.conversations.list('__global__'), conversationListFixture);
    queryClient.setQueryData(
      queryKeys.conversations.list(conversationFixture.knowledgeBaseId ?? '__global__'),
      conversationListFixture
    );
    queryClient.setQueryData(
      queryKeys.conversations.search({
        query: 'alpha',
        knowledgeBaseId: undefined,
        limit: 20,
        offset: 0,
      }),
      conversationSearchFixture
    );

    const mutationRef: {
      current?: {
        deleteConversation: ReturnType<typeof useDeleteConversation>;
      };
    } = {};

    function MutationProbe({
      onReady,
    }: {
      onReady: (mutation: { deleteConversation: ReturnType<typeof useDeleteConversation> }) => void;
    }) {
      const deleteConversation = useDeleteConversation();

      React.useEffect(() => {
        onReady({ deleteConversation });
      }, [deleteConversation, onReady]);

      return null;
    }

    const view = await renderWithClient(
      queryClient,
      <MutationProbe
        onReady={(mutation) => {
          mutationRef.current = mutation;
        }}
      />
    );

    await waitFor(() => mutationRef.current !== undefined);

    await act(async () => {
      await mutationRef.current?.deleteConversation.mutateAsync(conversationFixture.id);
    });

    expect(
      queryClient.getQueryData<ConversationListResponse>(queryKeys.conversations.list('__global__'))
        ?.items
    ).toEqual([]);
    expect(
      queryClient.getQueryData<ConversationListResponse>(
        queryKeys.conversations.list(conversationFixture.knowledgeBaseId ?? '__global__')
      )?.items
    ).toEqual([]);
    expect(
      queryClient.getQueryData<ConversationSearchResponse>(
        queryKeys.conversations.search({
          query: 'alpha',
          knowledgeBaseId: undefined,
          limit: 20,
          offset: 0,
        })
      )?.items
    ).toEqual([]);
    expect(invalidateSpy).not.toHaveBeenCalled();

    await view.unmount();
  });
});
