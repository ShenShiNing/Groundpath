import { v4 as uuidv4 } from 'uuid';
import { withTransaction } from '@core/db/db.utils';
import { documentChunkRepository } from '@modules/document/public/repositories';
import { documentIndexVersionRepository } from '../repositories/document-index-version.repository';
import { documentNodeRepository } from '../repositories/document-node.repository';
import { documentNodeContentRepository } from '../repositories/document-node-content.repository';
import { documentEdgeRepository } from '../repositories/document-edge.repository';
import { documentIndexActivationService } from './document-index-activation.service';
import type { ParsedDocumentStructure } from './parsers/types';

export interface DocumentChunkArtifact {
  id: string;
  chunkIndex: number;
  content: string;
  tokenCount: number | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  createdAt: Date;
}

export interface PersistChunkArtifactsInput {
  documentId: string;
  documentVersion: number;
  indexVersionId: string;
  chunks: DocumentChunkArtifact[];
}

export interface StartIndexBuildInput {
  documentId: string;
  documentVersion: number;
  routeMode: 'structured' | 'chunked';
  targetIndexVersion?: string;
  workerJobId?: string;
  createdBy?: string;
}

export interface CompleteIndexBuildInput {
  indexVersionId: string;
  parseMethod: string;
  parserRuntime: string;
  headingCount?: number;
  parseDurationMs?: number;
  error?: string | null;
  expectedPublishGeneration?: number;
  chunkCount?: number;
  knowledgeBaseId?: string;
  chunkDelta?: number;
}

export interface ReplaceGraphInput {
  documentId: string;
  indexVersionId: string;
  structure: ParsedDocumentStructure;
}

export const documentIndexService = {
  async startBuild(input: StartIndexBuildInput) {
    const indexVersion = input.targetIndexVersion ?? `idx-${uuidv4()}`;
    return documentIndexVersionRepository.create({
      id: uuidv4(),
      documentId: input.documentId,
      documentVersion: input.documentVersion,
      indexVersion,
      routeMode: input.routeMode,
      status: 'building',
      workerJobId: input.workerJobId ?? null,
      createdBy: input.createdBy ?? null,
    });
  },

  async completeBuild(input: CompleteIndexBuildInput) {
    await documentIndexVersionRepository.update(input.indexVersionId, {
      parseMethod: input.parseMethod,
      parserRuntime: input.parserRuntime,
      headingCount: input.headingCount ?? 0,
      parseDurationMs: input.parseDurationMs,
      error: input.error ?? null,
    });

    return documentIndexActivationService.activateVersion(input.indexVersionId, {
      expectedPublishGeneration: input.expectedPublishGeneration,
      chunkCount: input.chunkCount,
      knowledgeBaseId: input.knowledgeBaseId,
      chunkDelta: input.chunkDelta,
    });
  },

  async failBuild(indexVersionId: string, error: string) {
    return documentIndexActivationService.markFailed(indexVersionId, error);
  },

  async supersedeBuild(indexVersionId: string) {
    return documentIndexActivationService.markSuperseded(indexVersionId);
  },

  async persistChunkArtifacts(input: PersistChunkArtifactsInput) {
    return withTransaction(async (tx) => {
      await documentChunkRepository.createMany(
        input.chunks.map((chunk) => ({
          id: chunk.id,
          documentId: input.documentId,
          version: input.documentVersion,
          indexVersionId: input.indexVersionId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          tokenCount: chunk.tokenCount,
          metadata: chunk.metadata,
          createdBy: chunk.createdBy,
          createdAt: chunk.createdAt,
        })),
        tx
      );
    });
  },

  async replaceGraph(input: ReplaceGraphInput) {
    return withTransaction(async (tx) => {
      const nodeIdMap = new Map(input.structure.nodes.map((node) => [node.id, uuidv4()]));

      const nodes = input.structure.nodes.map((node) => ({
        id: nodeIdMap.get(node.id)!,
        documentId: input.documentId,
        indexVersionId: input.indexVersionId,
        nodeType: node.nodeType,
        title: node.title,
        depth: node.depth,
        sectionPath: node.sectionPath,
        pageStart: node.pageStart ?? null,
        pageEnd: node.pageEnd ?? null,
        parentId: node.parentId ? nodeIdMap.get(node.parentId)! : null,
        orderNo: node.orderNo,
        tokenCount: node.tokenCount,
        stableLocator: node.stableLocator,
        imageStorageKey: node.imageStorageKey ?? null,
        imageClassification: node.imageClassification ?? null,
      }));

      const contents = input.structure.nodes.map((node) => ({
        nodeId: nodeIdMap.get(node.id)!,
        documentId: input.documentId,
        indexVersionId: input.indexVersionId,
        content: node.content,
        contentPreview: node.contentPreview || null,
        tokenCount: node.tokenCount,
        imageDescription: node.imageDescription ?? null,
      }));

      const edges = input.structure.edges.map((edge) => ({
        id: uuidv4(),
        documentId: input.documentId,
        indexVersionId: input.indexVersionId,
        fromNodeId: nodeIdMap.get(edge.fromNodeId)!,
        toNodeId: nodeIdMap.get(edge.toNodeId)!,
        edgeType: edge.edgeType,
        anchorText: edge.anchorText ?? null,
      }));

      await documentEdgeRepository.deleteByIndexVersionId(input.indexVersionId, tx);
      await documentNodeContentRepository.deleteByIndexVersionId(input.indexVersionId, tx);
      await documentNodeRepository.deleteByIndexVersionId(input.indexVersionId, tx);

      await documentNodeRepository.createMany(nodes, tx);
      await documentNodeContentRepository.createMany(contents, tx);
      await documentEdgeRepository.createMany(edges, tx);

      return {
        nodeCount: nodes.length,
        edgeCount: edges.length,
      };
    });
  },
};
