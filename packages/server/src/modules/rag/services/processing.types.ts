import type { EmbeddingProvider } from '@modules/embedding';
import { documentRepository, documentVersionRepository } from '@modules/document/repositories';
import type { DocumentProcessingEnqueueOptions } from '../queue/document-processing.types';
import type { DocumentRouteMode, DocumentRouteReason } from '@modules/document-index/services';
import type { ParsedDocumentStructure } from '@modules/document-index/services/parsers/public-types';
import type { NewDocumentChunk } from '@core/db/schema/document/document-chunks.schema';
import type { VectorPoint } from '@modules/vector';

export interface DocumentProcessingResult {
  outcome: 'completed' | 'skipped' | 'failed';
  reason?: string;
}

export type ProcessingDocument = NonNullable<
  Awaited<ReturnType<typeof documentRepository.findById>>
>;
export type ProcessingVersion = NonNullable<
  Awaited<ReturnType<typeof documentVersionRepository.findByDocumentAndVersion>>
>;

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
  chunkRecords: NewDocumentChunk[];
  vectorPoints: VectorPoint[];
  embeddingProvider: EmbeddingProvider;
}
