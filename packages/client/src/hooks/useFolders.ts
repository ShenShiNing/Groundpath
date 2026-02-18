import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateFolderRequest, UpdateFolderRequest } from '@knowledge-agent/shared/types';
import { foldersApi } from '@/api';
import { queryKeys } from '@/lib/query';

// ==================== Query Hooks ====================

/**
 * Fetch all folders (flat list)
 */
export function useFolders() {
  return useQuery({
    queryKey: queryKeys.folders.lists(),
    queryFn: () => foldersApi.list(),
  });
}

/**
 * Fetch folder tree structure
 */
export function useFolderTree() {
  return useQuery({
    queryKey: queryKeys.folders.tree(),
    queryFn: () => foldersApi.getTree(),
  });
}

/**
 * Fetch folder details with counts
 */
export function useFolder(folderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.folders.detail(folderId!),
    queryFn: () => foldersApi.getById(folderId!),
    enabled: !!folderId,
  });
}

/**
 * Fetch child folders
 */
export function useFolderChildren(parentId: string | null) {
  return useQuery({
    queryKey: queryKeys.folders.children(parentId),
    queryFn: () => foldersApi.getChildren(parentId),
  });
}

// ==================== Mutation Hooks ====================

/**
 * Create a new folder
 */
export function useCreateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateFolderRequest) => foldersApi.create(data),
    onSuccess: () => {
      // Invalidate folder lists and tree
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.tree() });
    },
  });
}

/**
 * Update folder
 */
export function useUpdateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateFolderRequest }) =>
      foldersApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.tree() });
    },
  });
}

/**
 * Delete folder
 */
export function useDeleteFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      moveContentsToRoot = false,
    }: {
      id: string;
      moveContentsToRoot?: boolean;
    }) => foldersApi.delete(id, moveContentsToRoot),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.tree() });
      // Also invalidate documents as they may have been moved
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.lists() });
    },
  });
}
