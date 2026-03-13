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
  indexVersionId: string;
  chunkIndex: number;
  content: string;
  /** Soft delete marker - vectors marked as deleted will be excluded from search */
  isDeleted?: boolean;
  /** Cleanup watermark so background purge only removes vectors deleted before the run started */
  deletedAtMs?: number;
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
  documentVersion?: number;
  indexVersionId?: string;
}
