import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  DocumentListParams,
  TrashListParams,
  UpdateDocumentRequest,
} from '@knowledge-agent/shared/types';
import { documentsApi } from '@/api';
import { queryKeys } from '@/lib/queryClient';

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
        folderId?: string;
        onProgress?: (progress: number) => void;
      };
    }) => documentsApi.upload(file, options),
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
      // Invalidate document lists
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.lists() });
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
      options?: { changeNote?: string; onProgress?: (progress: number) => void };
    }) => documentsApi.uploadNewVersion(documentId, file, options),
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
