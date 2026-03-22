import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SaveDocumentContentRequest, UpdateDocumentRequest } from '@groundpath/shared/types';
import { documentsApi } from '@/api';
import { queryKeys } from '@/lib/query';
import {
  clearTrashCache,
  removeDocumentDetailCaches,
  removeDocumentFromListCache,
  removeDocumentFromTrashCache,
  syncDocumentContentCache,
  syncDocumentSummaryCaches,
  updateDocumentListCaches,
  updateTrashListCaches,
} from './documentCache';

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

export function useClearTrash() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => documentsApi.clearTrash(),
    onSuccess: () => {
      updateTrashListCaches(queryClient, clearTrashCache);
    },
  });
}

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
