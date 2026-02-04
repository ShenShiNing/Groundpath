export interface VectorPoint {
  id: string;
  vector: number[];
  payload: ChunkPayload;
}

export interface ChunkPayload {
  documentId: string;
  userId: string;
  knowledgeBaseId: string;
  version: number;
  chunkIndex: number;
  content: string;
  /** Soft delete marker - vectors marked as deleted will be excluded from search */
  isDeleted?: boolean;
}

export interface SearchOptions {
  userId: string;
  query: string;
  limit?: number;
  scoreThreshold?: number;
  documentIds?: string[];
  knowledgeBaseId?: string;
}

export interface SearchResult {
  id: string;
  documentId: string;
  knowledgeBaseId: string;
  content: string;
  score: number;
  chunkIndex: number;
}
