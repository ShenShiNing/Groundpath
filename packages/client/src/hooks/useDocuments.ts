import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  DocumentListParams,
  TrashListParams,
  UpdateDocumentRequest,
  DocumentContentResponse,
} from '@knowledge-agent/shared/types';
import { documentsApi } from '@/api';
import { queryKeys } from '@/lib/queryClient';
import { useEffect, useMemo } from 'react';

// ==================== Query Hooks ====================

/**
 * Fetch documents list with pagination and filtering
 */
export function useDocuments(params: Partial<DocumentListParams> = {}) {
  return useQuery({
    queryKey: queryKeys.documents.list(params),
    queryFn: () => documentsApi.list(params),
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
  });
}

/**
 * Fetch document version history
 */
export function useDocumentVersions(documentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.documents.versions(documentId!),
    queryFn: () => documentsApi.getVersionHistory(documentId!),
    enabled: !!documentId,
  });
}

/**
 * Fetch PDF blob for preview and manage object URL lifecycle
 */
export function useDocumentPdf(storageUrl: string | null | undefined) {
  const query = useQuery({
    queryKey: queryKeys.documents.pdf(storageUrl ?? ''),
    queryFn: () => documentsApi.getPdf(storageUrl!),
    enabled: !!storageUrl,
    staleTime: 5 * 60 * 1000, // 5 minutes - PDF content doesn't change often
  });

  // Derive blob URL from query data using useMemo
  const blobUrl = useMemo(() => {
    if (!query.data) return null;
    return URL.createObjectURL(query.data);
  }, [query.data]);

  // Cleanup blob URL when it changes or on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  const errorMessage = useMemo(() => {
    if (!query.error) return null;
    if (query.error instanceof Error) return query.error.message;
    return '加载失败';
  }, [query.error]);

  return {
    blobUrl,
    isLoading: query.isLoading,
    error: errorMessage,
    refetch: query.refetch,
  };
}

/**
 * Fetch trash documents
 */
export function useTrashDocuments(params: Partial<TrashListParams> = {}) {
  return useQuery({
    queryKey: queryKeys.trash.list(params),
    queryFn: () => documentsApi.listTrash(params),
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
        folderId?: string;
        onProgress?: (progress: number) => void;
        signal?: AbortSignal;
      };
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      if (options?.title) formData.append('title', options.title);
      if (options?.description) formData.append('description', options.description);
      if (options?.folderId) formData.append('folderId', options.folderId);

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
    onSuccess: () => {
      // Invalidate document lists to refetch
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
    onSuccess: (_, variables) => {
      // Invalidate specific document and lists
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.lists() });
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
    onSuccess: () => {
      // Invalidate both document and trash lists
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.lists() });
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
    onSuccess: () => {
      // Invalidate both trash and document lists
      queryClient.invalidateQueries({ queryKey: queryKeys.trash.lists() });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trash.lists() });
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
    onSuccess: (_, variables) => {
      // Invalidate document detail and versions
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.detail(variables.documentId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.documents.versions(variables.documentId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.lists() });
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.detail(variables.documentId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.documents.versions(variables.documentId),
      });
    },
  });
}
