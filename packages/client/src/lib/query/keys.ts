// Query keys factory for type-safe and consistent keys
export const queryKeys = {
  // Documents
  documents: {
    all: ['documents'] as const,
    lists: () => [...queryKeys.documents.all, 'list'] as const,
    list: (params: Record<string, unknown>) => [...queryKeys.documents.lists(), params] as const,
    details: () => [...queryKeys.documents.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.documents.details(), id] as const,
    content: (id: string) => [...queryKeys.documents.detail(id), 'content'] as const,
    versions: (id: string) => [...queryKeys.documents.detail(id), 'versions'] as const,
  },

  // Trash
  trash: {
    all: ['trash'] as const,
    lists: () => [...queryKeys.trash.all, 'list'] as const,
    list: (params: Record<string, unknown>) => [...queryKeys.trash.lists(), params] as const,
  },

  // Knowledge Bases
  knowledgeBases: {
    all: ['knowledgeBases'] as const,
    lists: () => [...queryKeys.knowledgeBases.all, 'list'] as const,
    details: () => [...queryKeys.knowledgeBases.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.knowledgeBases.details(), id] as const,
    documents: (kbId: string, params: Record<string, unknown>) =>
      [...queryKeys.knowledgeBases.detail(kbId), 'documents', params] as const,
    conversations: (kbId: string) =>
      [...queryKeys.knowledgeBases.detail(kbId), 'conversations'] as const,
  },

  // User
  user: {
    sessions: ['user', 'sessions'] as const,
  },

  // LLM Configuration
  llm: {
    config: ['llm', 'config'] as const,
    providers: ['llm', 'providers'] as const,
    models: (provider: string, hasKey: boolean, baseUrl: string | null) =>
      ['llm', 'models', provider, hasKey, baseUrl] as const,
  },

  // Chat
  chat: {
    searchConversations: (params: Record<string, unknown>) =>
      ['chat', 'searchConversations', params] as const,
  },

  // Logs / Observability
  logs: {
    structuredRagSummary: (params: Record<string, unknown>) =>
      ['logs', 'structuredRagSummary', params] as const,
  },
};
