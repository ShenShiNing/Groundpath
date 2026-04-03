import type { EmbeddingProvider } from '@modules/embedding/public/providers';
import type {
  DocumentProcessingSnapshot,
  DocumentVersionContentSnapshot,
} from '@modules/document/public/processing';
import type { DocumentChunkArtifact } from '@modules/document-index/public/indexing';
import type {
  DocumentRouteMode,
  DocumentRouteReason,
} from '@modules/document-index/public/routing';
import type { ParsedDocumentStructure } from '@modules/document-index/public/parsers';
import type { DocumentProcessingEnqueueOptions } from '../queue/document-processing.types';
import type { VectorPoint } from '@modules/vector/public/types';

export interface DocumentProcessingResult {
  outcome: 'completed' | 'skipped' | 'failed';
  reason?: string;
}

export type ProcessingDocument = DocumentProcessingSnapshot;
export type ProcessingVersion = DocumentVersionContentSnapshot;

export interface ProcessingRuntimeState {
  collectionName?: string;
  indexBuildId?: string;
  parsedStructure: ParsedDocumentStructure | null;
  routeMode: DocumentRouteMode;
  routeReason?: DocumentRouteReason;
  parseMethod: string;
  parserRuntime: string;
  headingCount: number;
  knowledgeBaseId?: string;
  documentVersion?: number;
  documentUpdatedAtMs?: number;
  publishGeneration?: number;
}

export interface ProcessingContext {
  documentId: string;
  userId: string;
  request?: DocumentProcessingEnqueueOptions;
  processStartedAt: number;
  state: ProcessingRuntimeState;
}

export interface ChunkProcessingArtifacts {
  chunks: Array<{
    chunkIndex: number;
    content: string;
    metadata: Record<string, unknown>;
  }>;
  chunkArtifacts: DocumentChunkArtifact[];
  vectorPoints: VectorPoint[];
  embeddingProvider: EmbeddingProvider;
}
