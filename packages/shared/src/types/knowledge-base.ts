import { KNOWLEDGE_BASE_ERROR_CODES } from '../constants';
import type { CursorPaginationMeta } from './api';

// ==================== Embedding Provider Types ====================

export const EMBEDDING_PROVIDERS = ['zhipu', 'openai', 'ollama'] as const;
export type EmbeddingProviderType = (typeof EMBEDDING_PROVIDERS)[number];

// ==================== Knowledge Base Interfaces ====================

/** Knowledge base info returned from API */
export interface KnowledgeBaseInfo {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  embeddingProvider: EmbeddingProviderType;
  embeddingModel: string;
  embeddingDimensions: number;
  documentCount: number;
  totalChunks: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Knowledge base list item */
export interface KnowledgeBaseListItem {
  id: string;
  name: string;
  description: string | null;
  embeddingProvider: EmbeddingProviderType;
  embeddingModel: string;
  embeddingDimensions: number;
  documentCount: number;
  totalChunks: number;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== Request Types ====================

export type {
  CreateKnowledgeBaseRequest,
  UpdateKnowledgeBaseRequest,
  KnowledgeBaseListParams,
} from '../schemas/knowledge-base';

// ==================== Response Types ====================

/** Paginated knowledge base list response */
export interface KnowledgeBaseListResponse {
  knowledgeBases: KnowledgeBaseListItem[];
  pagination: CursorPaginationMeta;
}

// ==================== Error Types ====================

export type KnowledgeBaseErrorCode =
  (typeof KNOWLEDGE_BASE_ERROR_CODES)[keyof typeof KNOWLEDGE_BASE_ERROR_CODES];
