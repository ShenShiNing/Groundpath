import React, { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DocumentContentResponse,
  DocumentInfo,
  DocumentListResponse,
  TrashListResponse,
  VersionListResponse,
} from '@knowledge-agent/shared/types';
import {
  useDeleteDocument,
  useDocument,
  useDocumentContent,
  useDocumentVersions,
  useTrashDocuments,
  useUpdateDocument,
  useDocuments,
} from '@/hooks/useDocuments';
import { queryKeys } from '@/lib/query';
import { flushPromises, render } from '../utils/render';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  getContent: vi.fn(),
  getVersionHistory: vi.fn(),
  listTrash: vi.fn(),
  update: vi.fn(),
  deleteDocument: vi.fn(),
}));

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    documentsApi: {
      ...actual.documentsApi,
      list: mocks.list,
      getById: mocks.getById,
      getContent: mocks.getContent,
      getVersionHistory: mocks.getVersionHistory,
      listTrash: mocks.listTrash,
      update: mocks.update,
      delete: mocks.deleteDocument,
    },
  };
});

const documentFixture: DocumentInfo = {
  id: 'doc-1',
  userId: 'user-1',
  title: 'Alpha Guide',
  description: 'Initial description',
  fileName: 'alpha.md',
  mimeType: 'text/markdown',
  fileSize: 128,
  fileExtension: 'md',
  documentType: 'markdown',
  currentVersion: 1,
  processingStatus: 'completed',
  chunkCount: 4,
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  updatedAt: new Date('2026-03-02T00:00:00.000Z'),
};

const documentListFixture: DocumentListResponse = {
  documents: [
    {
      id: documentFixture.id,
      title: documentFixture.title,
      description: documentFixture.description,
      fileName: documentFixture.fileName,
      fileSize: documentFixture.fileSize,
      fileExtension: documentFixture.fileExtension,
      documentType: documentFixture.documentType,
      processingStatus: documentFixture.processingStatus,
      createdAt: documentFixture.createdAt,
      updatedAt: documentFixture.updatedAt,
    },
  ],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  },
};

const documentContentFixture: DocumentContentResponse = {
  id: documentFixture.id,
  title: documentFixture.title,
  fileName: documentFixture.fileName,
  documentType: documentFixture.documentType,
  textContent: '# Alpha',
  currentVersion: documentFixture.currentVersion,
  processingStatus: documentFixture.processingStatus,
  isEditable: true,
  isTruncated: false,
  storageUrl: null,
};

const versionFixture: VersionListResponse = {
  versions: [],
  currentVersion: 1,
};

const trashFixture: TrashListResponse = {
  documents: [
    {
      ...documentListFixture.documents[0],
      deletedAt: new Date('2026-03-03T00:00:00.000Z'),
    },
  ],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
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

describe('useDocuments hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue(documentListFixture);
    mocks.getById.mockResolvedValue(documentFixture);
    mocks.getContent.mockResolvedValue(documentContentFixture);
    mocks.getVersionHistory.mockResolvedValue(versionFixture);
    mocks.listTrash.mockResolvedValue(trashFixture);
  });

  it('should apply explicit staleTime values for document and trash queries', async () => {
    const queryClient = createQueryClient();

    function QueryProbe() {
      useDocuments();
      useDocument(documentFixture.id);
      useDocumentContent(documentFixture.id);
      useDocumentVersions(documentFixture.id);
      useTrashDocuments();
      return null;
    }

    const view = await renderWithClient(queryClient, <QueryProbe />);

    await waitFor(
      () =>
        queryClient.getQueryData(queryKeys.documents.list({})) !== undefined &&
        queryClient.getQueryData(queryKeys.documents.detail(documentFixture.id)) !== undefined &&
        queryClient.getQueryData(queryKeys.documents.content(documentFixture.id)) !== undefined &&
        queryClient.getQueryData(queryKeys.documents.versions(documentFixture.id)) !== undefined &&
        queryClient.getQueryData(queryKeys.trash.list({})) !== undefined
    );

    expect(
      queryClient.getQueryCache().find({ queryKey: queryKeys.documents.list({}) })?.options
        .staleTime
    ).toBe(30_000);
    expect(
      queryClient.getQueryCache().find({ queryKey: queryKeys.documents.detail(documentFixture.id) })
        ?.options.staleTime
    ).toBe(60_000);
    expect(
      queryClient
        .getQueryCache()
        .find({ queryKey: queryKeys.documents.content(documentFixture.id) })?.options.staleTime
    ).toBe(60_000);
    expect(
      queryClient
        .getQueryCache()
        .find({ queryKey: queryKeys.documents.versions(documentFixture.id) })?.options.staleTime
    ).toBe(60_000);
    expect(
      queryClient.getQueryCache().find({ queryKey: queryKeys.trash.list({}) })?.options.staleTime
    ).toBe(30_000);

    await view.unmount();
  });

  it('should update cached detail, content, and list data without invalidating document lists', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const updatedDocument: DocumentInfo = {
      ...documentFixture,
      title: 'Renamed Guide',
      updatedAt: new Date('2026-03-05T00:00:00.000Z'),
    };

    mocks.update.mockResolvedValue(updatedDocument);
    queryClient.setQueryData(queryKeys.documents.list({}), documentListFixture);
    queryClient.setQueryData(queryKeys.documents.detail(documentFixture.id), documentFixture);
    queryClient.setQueryData(
      queryKeys.documents.content(documentFixture.id),
      documentContentFixture
    );

    let mutation:
      | {
          updateDocument: ReturnType<typeof useUpdateDocument>;
        }
      | undefined;

    function MutationProbe() {
      mutation = {
        updateDocument: useUpdateDocument(),
      };
      return null;
    }

    const view = await renderWithClient(queryClient, <MutationProbe />);

    await act(async () => {
      await mutation?.updateDocument.mutateAsync({
        id: documentFixture.id,
        data: { title: updatedDocument.title },
      });
    });

    expect(
      queryClient.getQueryData<DocumentInfo>(queryKeys.documents.detail(documentFixture.id))?.title
    ).toBe(updatedDocument.title);
    expect(
      queryClient.getQueryData<DocumentContentResponse>(
        queryKeys.documents.content(documentFixture.id)
      )?.title
    ).toBe(updatedDocument.title);
    expect(
      queryClient.getQueryData<DocumentListResponse>(queryKeys.documents.list({}))?.documents[0]
        ?.title
    ).toBe(updatedDocument.title);
    expect(invalidateSpy).not.toHaveBeenCalled();

    await view.unmount();
  });

  it('should remove deleted documents from cached lists and only invalidate trash queries', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    mocks.deleteDocument.mockResolvedValue(undefined);
    queryClient.setQueryData(queryKeys.documents.list({}), documentListFixture);
    queryClient.setQueryData(queryKeys.documents.list({ search: 'alpha' }), documentListFixture);
    queryClient.setQueryData(queryKeys.documents.detail(documentFixture.id), documentFixture);
    queryClient.setQueryData(
      queryKeys.documents.content(documentFixture.id),
      documentContentFixture
    );
    queryClient.setQueryData(queryKeys.documents.versions(documentFixture.id), versionFixture);

    let mutation:
      | {
          deleteDocument: ReturnType<typeof useDeleteDocument>;
        }
      | undefined;

    function MutationProbe() {
      mutation = {
        deleteDocument: useDeleteDocument(),
      };
      return null;
    }

    const view = await renderWithClient(queryClient, <MutationProbe />);

    await act(async () => {
      await mutation?.deleteDocument.mutateAsync(documentFixture.id);
    });

    expect(
      queryClient.getQueryData<DocumentListResponse>(queryKeys.documents.list({}))?.documents
    ).toEqual([]);
    expect(
      queryClient.getQueryData<DocumentListResponse>(queryKeys.documents.list({ search: 'alpha' }))
        ?.documents
    ).toEqual([]);
    expect(
      queryClient.getQueryData(queryKeys.documents.detail(documentFixture.id))
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(queryKeys.documents.content(documentFixture.id))
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(queryKeys.documents.versions(documentFixture.id))
    ).toBeUndefined();
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.trash.lists() });

    await view.unmount();
  });
});
