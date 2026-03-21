import type { QueryClient } from '@tanstack/react-query';
import type {
  DocumentContentResponse,
  DocumentInfo,
  DocumentListItem,
  DocumentListResponse,
  TrashListResponse,
} from '@knowledge-agent/shared/types';
import { queryKeys } from '@/lib/query';

function toDocumentListItem(document: DocumentInfo): DocumentListItem {
  return {
    id: document.id,
    title: document.title,
    description: document.description,
    fileName: document.fileName,
    fileSize: document.fileSize,
    fileExtension: document.fileExtension,
    documentType: document.documentType,
    processingStatus: document.processingStatus,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function updateDocumentListCaches(
  queryClient: QueryClient,
  updater: (current: DocumentListResponse) => DocumentListResponse
) {
  queryClient.setQueriesData<DocumentListResponse>(
    { queryKey: queryKeys.documents.lists() },
    (current) => (current ? updater(current) : current)
  );
}

function updateTrashListCaches(
  queryClient: QueryClient,
  updater: (current: TrashListResponse) => TrashListResponse
) {
  queryClient.setQueriesData<TrashListResponse>({ queryKey: queryKeys.trash.lists() }, (current) =>
    current ? updater(current) : current
  );
}

function syncDocumentIntoListCaches(queryClient: QueryClient, document: DocumentInfo) {
  updateDocumentListCaches(queryClient, (current) => {
    const nextItem = toDocumentListItem(document);
    const documents = current.documents.map((existing) =>
      existing.id === document.id ? { ...existing, ...nextItem } : existing
    );
    const changed = documents.some((item, index) => item !== current.documents[index]);
    return changed ? { ...current, documents } : current;
  });
}

function removeDocumentFromListCache(
  current: DocumentListResponse,
  documentId: string
): DocumentListResponse {
  const documents = current.documents.filter((document) => document.id !== documentId);
  if (documents.length === current.documents.length) {
    return current;
  }

  return {
    ...current,
    documents,
    pagination: {
      ...current.pagination,
      total: Math.max(0, current.pagination.total - (current.documents.length - documents.length)),
    },
  };
}

function removeDocumentFromTrashCache(
  current: TrashListResponse,
  documentId: string
): TrashListResponse {
  const documents = current.documents.filter((document) => document.id !== documentId);
  if (documents.length === current.documents.length) {
    return current;
  }

  return {
    ...current,
    documents,
    pagination: {
      ...current.pagination,
      total: Math.max(0, current.pagination.total - (current.documents.length - documents.length)),
    },
  };
}

function clearTrashCache(current: TrashListResponse): TrashListResponse {
  if (current.documents.length === 0 && current.pagination.total === 0) {
    return current;
  }

  return {
    ...current,
    documents: [],
    pagination: {
      ...current.pagination,
      total: 0,
      totalPages: 0,
    },
  };
}

function syncDocumentSummaryCaches(queryClient: QueryClient, document: DocumentInfo) {
  queryClient.setQueryData(queryKeys.documents.detail(document.id), document);
  syncDocumentIntoListCaches(queryClient, document);
}

function syncDocumentContentCache(
  queryClient: QueryClient,
  document: DocumentInfo,
  content: string | undefined
) {
  queryClient.setQueryData<DocumentContentResponse>(
    queryKeys.documents.content(document.id),
    (current) =>
      current
        ? {
            ...current,
            title: document.title,
            fileName: document.fileName,
            documentType: document.documentType,
            textContent: content ?? current.textContent,
            currentVersion: document.currentVersion,
            processingStatus: document.processingStatus,
          }
        : current
  );
}

function removeDocumentDetailCaches(queryClient: QueryClient, documentId: string) {
  queryClient.removeQueries({ queryKey: queryKeys.documents.detail(documentId), exact: true });
  queryClient.removeQueries({ queryKey: queryKeys.documents.content(documentId), exact: true });
  queryClient.removeQueries({ queryKey: queryKeys.documents.versions(documentId), exact: true });
}

export {
  clearTrashCache,
  removeDocumentDetailCaches,
  removeDocumentFromListCache,
  removeDocumentFromTrashCache,
  syncDocumentContentCache,
  syncDocumentSummaryCaches,
  updateDocumentListCaches,
  updateTrashListCaches,
};
