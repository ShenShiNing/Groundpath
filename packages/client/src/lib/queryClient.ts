import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes (previously cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Query keys factory for type-safe and consistent keys
export const queryKeys = {
  // Documents
  documents: {
    all: ['documents'] as const,
    lists: () => [...queryKeys.documents.all, 'list'] as const,
    list: (params: Record<string, unknown>) => [...queryKeys.documents.lists(), params] as const,
    details: () => [...queryKeys.documents.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.documents.details(), id] as const,
    versions: (id: string) => [...queryKeys.documents.detail(id), 'versions'] as const,
  },

  // Trash
  trash: {
    all: ['trash'] as const,
    lists: () => [...queryKeys.trash.all, 'list'] as const,
    list: (params: Record<string, unknown>) => [...queryKeys.trash.lists(), params] as const,
  },

  // Folders
  folders: {
    all: ['folders'] as const,
    lists: () => [...queryKeys.folders.all, 'list'] as const,
    tree: () => [...queryKeys.folders.all, 'tree'] as const,
    details: () => [...queryKeys.folders.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.folders.details(), id] as const,
    children: (parentId: string | null) =>
      [...queryKeys.folders.all, 'children', parentId ?? 'root'] as const,
  },

  // User
  user: {
    sessions: ['user', 'sessions'] as const,
  },
};
