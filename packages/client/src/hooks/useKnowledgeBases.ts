import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useEffect } from 'react';
import { queryKeys } from '@/lib/query';
import { knowledgeBasesApi, documentsApi } from '@/api';
import type {
  CreateKnowledgeBaseRequest,
  UpdateKnowledgeBaseRequest,
  DocumentListParams,
} from '@knowledge-agent/shared/types';

// ==================== Query Hooks ====================

export function useKnowledgeBases() {
  return useQuery({
    queryKey: queryKeys.knowledgeBases.all,
    queryFn: () => knowledgeBasesApi.list(),
  });
}

export function useKnowledgeBase(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.knowledgeBases.detail(id!),
    queryFn: () => knowledgeBasesApi.getById(id!),
    enabled: !!id,
  });
}

const POLLING_INTERVAL = 3000; // 3 seconds
const POLLING_MAX_DURATION = 5 * 60 * 1000; // 5 minutes max polling

export function useKBDocuments(kbId: string | undefined, params?: Partial<DocumentListParams>) {
  // Track when polling started for processing documents
  const pollingStartRef = useRef<number | null>(null);

  const query = useQuery({
    queryKey: queryKeys.knowledgeBases.documents(kbId!, params ?? {}),
    queryFn: () => knowledgeBasesApi.listDocuments(kbId!, params),
    enabled: !!kbId,
    refetchInterval: (q) => {
      const documents = q.state.data?.documents;
      if (!documents) return false;

      const hasProcessing = documents.some(
        (doc) => doc.processingStatus === 'pending' || doc.processingStatus === 'processing'
      );

      if (!hasProcessing) {
        // Reset polling start time when no documents are processing
        pollingStartRef.current = null;
        return false;
      }

      // Initialize polling start time
      if (pollingStartRef.current === null) {
        pollingStartRef.current = Date.now();
      }

      // Stop polling after max duration
      const elapsed = Date.now() - pollingStartRef.current;
      if (elapsed > POLLING_MAX_DURATION) {
        return false;
      }

      return POLLING_INTERVAL;
    },
  });

  // Reset polling start when kbId changes
  useEffect(() => {
    pollingStartRef.current = null;
  }, [kbId]);

  return query;
}

// ==================== Mutation Hooks ====================

export function useCreateKnowledgeBase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateKnowledgeBaseRequest) => knowledgeBasesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases.all });
    },
  });
}

export function useUpdateKnowledgeBase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateKnowledgeBaseRequest }) =>
      knowledgeBasesApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases.detail(id) });
    },
  });
}

export function useDeleteKnowledgeBase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => knowledgeBasesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases.all });
    },
  });
}

export function useUploadToKB() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      kbId,
      formData,
      options,
    }: {
      kbId: string;
      formData: FormData;
      options?: {
        onUploadProgress?: (loaded: number, total: number) => void;
        signal?: AbortSignal;
      };
    }) => knowledgeBasesApi.uploadDocument(kbId, formData, options),
    onSuccess: (_, { kbId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases.documents(kbId, {}) });
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases.detail(kbId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
    },
  });
}

/**
 * Hook for batch deleting documents
 */
export function useDeleteDocuments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentIds: string[]) => {
      // Delete documents in parallel
      await Promise.all(documentIds.map((id) => documentsApi.delete(id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases.all });
    },
  });
}
