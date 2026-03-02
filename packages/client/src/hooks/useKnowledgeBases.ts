import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useEffect } from 'react';
import { queryKeys } from '@/lib/query';
import { knowledgeBasesApi, documentsApi } from '@/api';
import type {
  CreateKnowledgeBaseRequest,
  UpdateKnowledgeBaseRequest,
  DocumentListParams,
  CreateFolderRequest,
  FolderTreeNode,
  DocumentListItem,
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

export function useKBFolders(kbId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.knowledgeBases.folders(kbId!),
    queryFn: () => knowledgeBasesApi.listFolders(kbId!),
    enabled: !!kbId,
  });
}

export function useKBFolderTree(kbId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.knowledgeBases.folderTree(kbId!),
    queryFn: () => knowledgeBasesApi.getFolderTree(kbId!),
    enabled: !!kbId,
  });
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

export function useCreateFolderInKB() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      kbId,
      data,
    }: {
      kbId: string;
      data: Omit<CreateFolderRequest, 'knowledgeBaseId'>;
    }) => knowledgeBasesApi.createFolder(kbId, data),
    onSuccess: (_, { kbId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases.folders(kbId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases.folderTree(kbId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
    },
  });
}

// ==================== Combined Hooks ====================

/**
 * Tree node type for mixed folder/document tree
 */
export interface DocumentTreeNode {
  id: string;
  name: string;
  type: 'folder' | 'document';
  folder?: FolderTreeNode;
  document?: DocumentListItem;
  children?: DocumentTreeNode[];
}

/**
 * Hook that combines folder tree and documents into a unified tree structure
 */
export function useKBDocumentTree(kbId: string | undefined) {
  const { data: folderTree, isLoading: foldersLoading } = useKBFolderTree(kbId);
  const { data: documentsResponse, isLoading: docsLoading } = useKBDocuments(kbId, {
    pageSize: 1000, // Get all documents for tree view
  });

  const tree = useMemo(() => {
    if (!folderTree || !documentsResponse) return [];

    const documents = documentsResponse.documents;

    function buildTree(
      folders: FolderTreeNode[],
      parentId: string | null = null
    ): DocumentTreeNode[] {
      const result: DocumentTreeNode[] = [];

      // Add folders at this level
      for (const folder of folders) {
        const folderDocs = documents.filter((d) => d.folderId === folder.id);
        result.push({
          id: folder.id,
          name: folder.name,
          type: 'folder',
          folder,
          children: [
            ...buildTree(folder.children, folder.id),
            ...folderDocs.map((doc) => ({
              id: doc.id,
              name: doc.title,
              type: 'document' as const,
              document: doc,
            })),
          ],
        });
      }

      // Add root-level documents (only at root)
      if (parentId === null) {
        const rootDocs = documents.filter((d) => d.folderId === null);
        for (const doc of rootDocs) {
          result.push({
            id: doc.id,
            name: doc.title,
            type: 'document',
            document: doc,
          });
        }
      }

      return result;
    }

    return buildTree(folderTree);
  }, [folderTree, documentsResponse]);

  return {
    data: tree,
    isLoading: foldersLoading || docsLoading,
  };
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

/**
 * Hook for moving documents to a different folder
 */
export function useMoveDocuments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      documentIds,
      targetFolderId,
    }: {
      documentIds: string[];
      targetFolderId: string | null;
    }) => {
      // Move documents in parallel
      await Promise.all(
        documentIds.map((id) => documentsApi.update(id, { folderId: targetFolderId }))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases.all });
    },
  });
}
