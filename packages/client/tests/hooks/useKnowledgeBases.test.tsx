import React, { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DocumentInfo,
  DocumentListResponse,
  KnowledgeBaseInfo,
  KnowledgeBaseListItem,
} from '@groundpath/shared/types';
import {
  useCreateKnowledgeBase,
  useDeleteDocuments,
  useDeleteKnowledgeBase,
  useKBDocuments,
  useKnowledgeBase,
  useKnowledgeBases,
  useUpdateKnowledgeBase,
  useUploadToKB,
} from '@/hooks/useKnowledgeBases';
import { queryKeys } from '@/lib/query';
import { flushPromises, render } from '../utils/render';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  listDocuments: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteKnowledgeBase: vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
}));

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    knowledgeBasesApi: {
      ...actual.knowledgeBasesApi,
      list: mocks.list,
      getById: mocks.getById,
      listDocuments: mocks.listDocuments,
      create: mocks.create,
      update: mocks.update,
      delete: mocks.deleteKnowledgeBase,
      uploadDocument: mocks.uploadDocument,
    },
    documentsApi: {
      ...actual.documentsApi,
      delete: mocks.deleteDocument,
    },
  };
});

const knowledgeBaseFixture: KnowledgeBaseInfo = {
  id: 'kb-1',
  userId: 'user-1',
  name: 'Alpha KB',
  description: 'Primary knowledge base',
  embeddingProvider: 'zhipu',
  embeddingModel: 'embedding-3',
  embeddingDimensions: 1024,
  documentCount: 2,
  totalChunks: 8,
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  updatedAt: new Date('2026-03-02T00:00:00.000Z'),
};

const knowledgeBaseListFixture: KnowledgeBaseListItem[] = [
  {
    id: knowledgeBaseFixture.id,
    name: knowledgeBaseFixture.name,
    description: knowledgeBaseFixture.description,
    embeddingProvider: knowledgeBaseFixture.embeddingProvider,
    embeddingModel: knowledgeBaseFixture.embeddingModel,
    embeddingDimensions: knowledgeBaseFixture.embeddingDimensions,
    documentCount: knowledgeBaseFixture.documentCount,
    totalChunks: knowledgeBaseFixture.totalChunks,
    createdAt: knowledgeBaseFixture.createdAt,
    updatedAt: knowledgeBaseFixture.updatedAt,
  },
];

const documentsFixture: DocumentListResponse = {
  documents: [
    {
      id: 'doc-1',
      title: 'Alpha Doc',
      description: 'Ready',
      fileName: 'alpha.md',
      fileSize: 128,
      fileExtension: 'md',
      documentType: 'markdown',
      processingStatus: 'completed',
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    },
  ],
  pagination: {
    pageSize: 20,
    total: 1,
    hasMore: false,
    nextCursor: null,
  },
};

const uploadDocumentFixture: DocumentInfo = {
  id: 'doc-2',
  userId: 'user-1',
  title: 'New Doc',
  description: null,
  fileName: 'new-doc.md',
  mimeType: 'text/markdown',
  fileSize: 256,
  fileExtension: 'md',
  documentType: 'markdown',
  currentVersion: 1,
  processingStatus: 'pending',
  chunkCount: 0,
  createdAt: new Date('2026-03-03T00:00:00.000Z'),
  updatedAt: new Date('2026-03-03T00:00:00.000Z'),
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

describe('useKnowledgeBases hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue(knowledgeBaseListFixture);
    mocks.getById.mockResolvedValue(knowledgeBaseFixture);
    mocks.listDocuments.mockResolvedValue(documentsFixture);
    mocks.create.mockResolvedValue(knowledgeBaseFixture);
    mocks.update.mockResolvedValue(knowledgeBaseFixture);
    mocks.deleteKnowledgeBase.mockResolvedValue(undefined);
    mocks.uploadDocument.mockResolvedValue({
      document: uploadDocumentFixture,
      message: 'ok',
    });
    mocks.deleteDocument.mockResolvedValue(undefined);
  });

  it('should fetch knowledge base list and detail queries with expected keys', async () => {
    const queryClient = createQueryClient();

    function QueryProbe() {
      useKnowledgeBases();
      useKnowledgeBase(knowledgeBaseFixture.id);
      return null;
    }

    const view = await renderWithClient(queryClient, <QueryProbe />);

    await waitFor(
      () =>
        queryClient.getQueryData(queryKeys.knowledgeBases.all) !== undefined &&
        queryClient.getQueryData(queryKeys.knowledgeBases.detail(knowledgeBaseFixture.id)) !==
          undefined
    );

    expect(queryClient.getQueryData(queryKeys.knowledgeBases.all)).toEqual(
      knowledgeBaseListFixture
    );
    expect(queryClient.getQueryData(queryKeys.knowledgeBases.detail(knowledgeBaseFixture.id))).toBe(
      knowledgeBaseFixture
    );

    await view.unmount();
  });

  it('should stop polling when documents are stable and poll while processing', async () => {
    const queryClient = createQueryClient();
    const params = { pageSize: 50 };

    function QueryProbe() {
      useKBDocuments(knowledgeBaseFixture.id, params);
      return null;
    }

    const view = await renderWithClient(queryClient, <QueryProbe />);

    await waitFor(
      () =>
        queryClient.getQueryData(
          queryKeys.knowledgeBases.documents(knowledgeBaseFixture.id, params)
        ) !== undefined
    );

    const query = queryClient.getQueryCache().find({
      queryKey: queryKeys.knowledgeBases.documents(knowledgeBaseFixture.id, params),
    });
    const refetchInterval = (
      query?.options as
        | {
            refetchInterval?: unknown;
          }
        | undefined
    )?.refetchInterval;

    expect(typeof refetchInterval).toBe('function');
    if (typeof refetchInterval !== 'function') {
      throw new Error('Expected refetchInterval to be configured');
    }

    const processingResult = refetchInterval({
      state: {
        data: {
          ...documentsFixture,
          documents: [
            {
              ...documentsFixture.documents[0],
              processingStatus: 'processing',
            },
          ],
        },
      },
    } as never);
    const stableResult = refetchInterval({
      state: { data: documentsFixture },
    } as never);

    expect(processingResult).toBe(3000);
    expect(stableResult).toBe(false);

    await view.unmount();
  });

  it('should invalidate precise caches for knowledge base mutations', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const mutationRef: {
      current?: {
        createKnowledgeBase: ReturnType<typeof useCreateKnowledgeBase>;
        updateKnowledgeBase: ReturnType<typeof useUpdateKnowledgeBase>;
        deleteKnowledgeBase: ReturnType<typeof useDeleteKnowledgeBase>;
        uploadToKB: ReturnType<typeof useUploadToKB>;
        deleteDocuments: ReturnType<typeof useDeleteDocuments>;
      };
    } = {};

    function MutationProbe({
      onReady,
    }: {
      onReady: (mutation: NonNullable<typeof mutationRef.current>) => void;
    }) {
      const createKnowledgeBase = useCreateKnowledgeBase();
      const updateKnowledgeBase = useUpdateKnowledgeBase();
      const deleteKnowledgeBase = useDeleteKnowledgeBase();
      const uploadToKB = useUploadToKB();
      const deleteDocuments = useDeleteDocuments();

      React.useEffect(() => {
        onReady({
          createKnowledgeBase,
          updateKnowledgeBase,
          deleteKnowledgeBase,
          uploadToKB,
          deleteDocuments,
        });
      }, [
        createKnowledgeBase,
        deleteDocuments,
        deleteKnowledgeBase,
        onReady,
        updateKnowledgeBase,
        uploadToKB,
      ]);

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
      await mutationRef.current?.createKnowledgeBase.mutateAsync({
        name: knowledgeBaseFixture.name,
        description: knowledgeBaseFixture.description ?? null,
        embeddingProvider: knowledgeBaseFixture.embeddingProvider,
      });
      await mutationRef.current?.updateKnowledgeBase.mutateAsync({
        id: knowledgeBaseFixture.id,
        data: { name: 'Renamed KB' },
      });
      await mutationRef.current?.deleteKnowledgeBase.mutateAsync(knowledgeBaseFixture.id);

      const formData = new FormData();
      formData.append('file', new File(['hello'], 'alpha.md', { type: 'text/markdown' }));
      await mutationRef.current?.uploadToKB.mutateAsync({
        kbId: knowledgeBaseFixture.id,
        formData,
      });

      await mutationRef.current?.deleteDocuments.mutateAsync(['doc-1', 'doc-2']);
    });

    expect(mocks.deleteDocument).toHaveBeenCalledTimes(2);
    expect(invalidateSpy.mock.calls.map(([query]) => query)).toEqual([
      { queryKey: queryKeys.knowledgeBases.all },
      { queryKey: queryKeys.knowledgeBases.all },
      { queryKey: queryKeys.knowledgeBases.detail(knowledgeBaseFixture.id) },
      { queryKey: queryKeys.knowledgeBases.all },
      { queryKey: queryKeys.knowledgeBases.documents(knowledgeBaseFixture.id, {}) },
      { queryKey: queryKeys.knowledgeBases.detail(knowledgeBaseFixture.id) },
      { queryKey: queryKeys.documents.all },
      { queryKey: queryKeys.documents.all },
      { queryKey: queryKeys.knowledgeBases.all },
    ]);

    await view.unmount();
  });
});
