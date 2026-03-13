import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  DocumentContentResponse,
  DocumentInfo,
  DocumentListItem,
  DocumentListParams,
  DocumentListResponse,
  SaveDocumentContentRequest,
  TrashListParams,
  TrashListResponse,
  UpdateDocumentRequest,
  VersionListResponse,
} from '@knowledge-agent/shared/types';
import { documentsApi } from '@/api';
import { queryKeys } from '@/lib/query';

const DOCUMENT_LIST_STALE_TIME_MS = 30 * 1000;
const DOCUMENT_DETAIL_STALE_TIME_MS = 60 * 1000;
const DOCUMENT_CONTENT_STALE_TIME_MS = 60 * 1000;
const DOCUMENT_VERSION_STALE_TIME_MS = 60 * 1000;
const TRASH_LIST_STALE_TIME_MS = 30 * 1000;

// ==================== Cache helpers ====================

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

// ==================== Query Hooks ====================

/**
 * Fetch documents list with pagination and filtering
 */
export function useDocuments(params: Partial<DocumentListParams> = {}) {
  return useQuery({
    queryKey: queryKeys.documents.list(params),
    queryFn: () => documentsApi.list(params),
    staleTime: DOCUMENT_LIST_STALE_TIME_MS,
  });
}

/**
 * Fetch single document details
 */
export function useDocument(documentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.documents.detail(documentId!),
    queryFn: () => documentsApi.getById(documentId!),
    enabled: !!documentId,
    staleTime: DOCUMENT_DETAIL_STALE_TIME_MS,
  });
}

/**
 * Fetch document content
 */
export function useDocumentContent(documentId: string | undefined) {
  return useQuery<DocumentContentResponse>({
    queryKey: queryKeys.documents.content(documentId!),
    queryFn: () => documentsApi.getContent(documentId!),
    enabled: !!documentId,
    staleTime: DOCUMENT_CONTENT_STALE_TIME_MS,
  });
}

/**
 * Fetch document version history
 */
export function useDocumentVersions(documentId: string | undefined) {
  return useQuery<VersionListResponse>({
    queryKey: queryKeys.documents.versions(documentId!),
    queryFn: () => documentsApi.getVersionHistory(documentId!),
    enabled: !!documentId,
    staleTime: DOCUMENT_VERSION_STALE_TIME_MS,
  });
}

/**
 * Fetch trash documents
 */
export function useTrashDocuments(params: Partial<TrashListParams> = {}) {
  return useQuery({
    queryKey: queryKeys.trash.list(params),
    queryFn: () => documentsApi.listTrash(params),
    staleTime: TRASH_LIST_STALE_TIME_MS,
  });
}

// ==================== Mutation Hooks ====================

/**
 * Upload a new document
 */
export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      file,
      options,
    }: {
      file: File;
      options?: {
        title?: string;
        description?: string;
        onProgress?: (progress: number) => void;
        signal?: AbortSignal;
      };
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      if (options?.title) formData.append('title', options.title);
      if (options?.description) formData.append('description', options.description);

      return documentsApi.upload(formData, {
        onUploadProgress: options?.onProgress
          ? (loaded, total) => {
              const progress = total > 0 ? Math.round((loaded / total) * 100) : 0;
              options.onProgress!(progress);
            }
          : undefined,
        signal: options?.signal,
      });
    },
    onSuccess: ({ document }) => {
      syncDocumentSummaryCaches(queryClient, document);
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.lists() });
    },
  });
}

/**
 * Update document metadata
 */
export function useUpdateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDocumentRequest }) =>
      documentsApi.update(id, data),
    onSuccess: (document) => {
      syncDocumentSummaryCaches(queryClient, document);
      syncDocumentContentCache(queryClient, document, undefined);
    },
  });
}

/**
 * Save document content
 */
export function useSaveDocumentContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SaveDocumentContentRequest }) =>
      documentsApi.saveContent(id, data),
    onSuccess: ({ document }, variables) => {
      syncDocumentSummaryCaches(queryClient, document);
      syncDocumentContentCache(queryClient, document, variables.data.content);
      queryClient.invalidateQueries({
        queryKey: queryKeys.documents.versions(variables.id),
        exact: true,
      });
    },
  });
}

/**
 * Delete document (move to trash)
 */
export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (documentId: string) => documentsApi.delete(documentId),
    onSuccess: (_, documentId) => {
      updateDocumentListCaches(queryClient, (current) =>
        removeDocumentFromListCache(current, documentId)
      );
      removeDocumentDetailCaches(queryClient, documentId);
      queryClient.invalidateQueries({ queryKey: queryKeys.trash.lists() });
    },
  });
}

/**
 * Restore document from trash
 */
export function useRestoreDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (documentId: string) => documentsApi.restore(documentId),
    onSuccess: ({ document }) => {
      syncDocumentSummaryCaches(queryClient, document);
      updateTrashListCaches(queryClient, (current) =>
        removeDocumentFromTrashCache(current, document.id)
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.lists() });
    },
  });
}

/**
 * Permanently delete document
 */
export function usePermanentDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (documentId: string) => documentsApi.permanentDelete(documentId),
    onSuccess: (_, documentId) => {
      updateTrashListCaches(queryClient, (current) =>
        removeDocumentFromTrashCache(current, documentId)
      );
      removeDocumentDetailCaches(queryClient, documentId);
    },
  });
}

/**
 * Clear all documents in trash
 */
export function useClearTrash() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => documentsApi.clearTrash(),
    onSuccess: () => {
      updateTrashListCaches(queryClient, clearTrashCache);
    },
  });
}

/**
 * Upload new version of a document
 */
export function useUploadNewVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      file,
      options,
    }: {
      documentId: string;
      file: File;
      options?: {
        changeNote?: string;
        onProgress?: (progress: number) => void;
        signal?: AbortSignal;
      };
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      if (options?.changeNote) formData.append('changeNote', options.changeNote);

      return documentsApi.uploadNewVersion(documentId, formData, {
        onUploadProgress: options?.onProgress
          ? (loaded, total) => {
              const progress = total > 0 ? Math.round((loaded / total) * 100) : 0;
              options.onProgress!(progress);
            }
          : undefined,
        signal: options?.signal,
      });
    },
    onSuccess: ({ document }) => {
      syncDocumentSummaryCaches(queryClient, document);
      queryClient.invalidateQueries({
        queryKey: queryKeys.documents.content(document.id),
        exact: true,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.documents.versions(document.id),
        exact: true,
      });
    },
  });
}

/**
 * Restore document to a specific version
 */
export function useRestoreVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ documentId, versionId }: { documentId: string; versionId: string }) =>
      documentsApi.restoreVersion(documentId, versionId),
    onSuccess: ({ document }) => {
      syncDocumentSummaryCaches(queryClient, document);
      queryClient.invalidateQueries({
        queryKey: queryKeys.documents.content(document.id),
        exact: true,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.documents.versions(document.id),
        exact: true,
      });
    },
  });
}
