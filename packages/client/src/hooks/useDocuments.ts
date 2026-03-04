import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  DocumentListParams,
  TrashListParams,
  UpdateDocumentRequest,
  DocumentContentResponse,
  SaveDocumentContentRequest,
} from '@knowledge-agent/shared/types';
import { documentsApi } from '@/api';
import { queryKeys } from '@/lib/query';

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
 * Save document content
 */
export function useSaveDocumentContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SaveDocumentContentRequest }) =>
      documentsApi.saveContent(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.content(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.versions(variables.id) });
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
 * Clear all documents in trash
 */
export function useClearTrash() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => documentsApi.clearTrash(),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.content(variables.documentId) });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.content(variables.documentId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.documents.versions(variables.documentId),
      });
    },
  });
}
