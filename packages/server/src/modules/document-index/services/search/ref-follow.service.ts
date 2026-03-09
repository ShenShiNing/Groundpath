import { agentConfig } from '@config/env';
import type { Citation } from '@knowledge-agent/shared/types';
import { documentEdgeRepository } from '../../repositories/document-edge.repository';
import { documentNodeSearchRepository } from '../../repositories/document-node-search.repository';

export interface RefFollowInput {
  userId: string;
  knowledgeBaseId?: string | null;
  documentIds?: string[];
  nodeId: string;
  depth?: number;
  edgeTypes?: Array<'parent' | 'next' | 'refers_to' | 'cites'>;
}

export interface RefFollowPathItem {
  depth: number;
  fromNodeId: string;
  toNodeId: string;
  edgeType: 'parent' | 'next' | 'refers_to' | 'cites';
  anchorText?: string;
  target: {
    nodeId: string;
    documentId: string;
    documentTitle: string;
    documentVersion: number;
    indexVersion: string;
    title: string;
    sectionPath: string[];
    locator: string;
    pageStart?: number;
    pageEnd?: number;
  };
}

const DEFAULT_EDGE_TYPES: RefFollowInput['edgeTypes'] = ['refers_to', 'cites', 'parent', 'next'];

function toLocator(row: {
  stableLocator: string | null;
  sectionPath: string[] | null;
  title: string | null;
  documentTitle: string;
  pageStart: number | null;
  pageEnd: number | null;
}) {
  const base = row.stableLocator || row.sectionPath?.join(' > ') || row.title || row.documentTitle;
  if (row.pageStart && row.pageEnd) {
    return row.pageStart === row.pageEnd
      ? `${base} / p.${row.pageStart}`
      : `${base} / p.${row.pageStart}-${row.pageEnd}`;
  }
  if (row.pageStart) return `${base} / p.${row.pageStart}`;
  if (row.pageEnd) return `${base} / p.${row.pageEnd}`;
  return base;
}

export const refFollowService = {
  async follow(input: RefFollowInput): Promise<{
    paths: RefFollowPathItem[];
    citations: Citation[];
    truncated: boolean;
    maxDepthReached: boolean;
  }> {
    const startRows = await documentNodeSearchRepository.getAccessibleNodesByIds({
      userId: input.userId,
      knowledgeBaseId: input.knowledgeBaseId,
      documentIds: input.documentIds,
      nodeIds: [input.nodeId],
    });

    const startRow = startRows[0];
    if (!startRow) {
      return { paths: [], citations: [], truncated: false, maxDepthReached: false };
    }

    const maxDepth = Math.min(
      input.depth ?? agentConfig.refFollowMaxDepth,
      agentConfig.refFollowMaxDepth
    );
    const edgeTypes = input.edgeTypes?.length ? input.edgeTypes : DEFAULT_EDGE_TYPES;

    let frontier = [startRow.nodeId];
    let currentDepth = 0;
    let truncated = false;
    const visitedNodeIds = new Set<string>([startRow.nodeId]);
    const paths: RefFollowPathItem[] = [];

    while (frontier.length > 0 && currentDepth < maxDepth) {
      const edges = await documentEdgeRepository.listByIndexVersionAndFromNodeIds(
        startRow.indexVersionId,
        frontier,
        edgeTypes
      );

      if (edges.length === 0) break;

      const candidateTargetIds = edges
        .map((edge) => edge.toNodeId)
        .filter((nodeId) => !visitedNodeIds.has(nodeId));

      const uniqueTargetIds = [...new Set(candidateTargetIds)];
      if (uniqueTargetIds.length === 0) break;

      const remainingCapacity = agentConfig.refFollowMaxNodes - (visitedNodeIds.size - 1);
      const allowedTargetIds = uniqueTargetIds.slice(0, Math.max(remainingCapacity, 0));
      if (allowedTargetIds.length < uniqueTargetIds.length) {
        truncated = true;
      }

      if (allowedTargetIds.length === 0) break;

      const targetRows = await documentNodeSearchRepository.getAccessibleNodesByIds({
        userId: input.userId,
        knowledgeBaseId: input.knowledgeBaseId,
        documentIds: input.documentIds,
        nodeIds: allowedTargetIds,
      });
      const targetRowById = new Map(targetRows.map((row) => [row.nodeId, row]));

      const nextFrontier: string[] = [];
      for (const edge of edges) {
        const targetRow = targetRowById.get(edge.toNodeId);
        if (!targetRow || visitedNodeIds.has(targetRow.nodeId)) continue;

        visitedNodeIds.add(targetRow.nodeId);
        nextFrontier.push(targetRow.nodeId);
        paths.push({
          depth: currentDepth + 1,
          fromNodeId: edge.fromNodeId,
          toNodeId: edge.toNodeId,
          edgeType: edge.edgeType,
          anchorText: edge.anchorText ?? undefined,
          target: {
            nodeId: targetRow.nodeId,
            documentId: targetRow.documentId,
            documentTitle: targetRow.documentTitle,
            documentVersion: targetRow.documentVersion,
            indexVersion: targetRow.indexVersion,
            title:
              targetRow.title ||
              targetRow.stableLocator ||
              targetRow.sectionPath?.join(' > ') ||
              targetRow.nodeId,
            sectionPath: targetRow.sectionPath ?? [],
            locator: toLocator(targetRow),
            pageStart: targetRow.pageStart ?? undefined,
            pageEnd: targetRow.pageEnd ?? undefined,
          },
        });
      }

      frontier = nextFrontier;
      currentDepth += 1;
    }

    const dedupedCitations = new Map<string, Citation>();
    for (const path of paths) {
      dedupedCitations.set(path.toNodeId, {
        sourceType: 'node',
        documentId: path.target.documentId,
        documentTitle: path.target.documentTitle,
        documentVersion: path.target.documentVersion,
        indexVersion: path.target.indexVersion,
        nodeId: path.target.nodeId,
        sectionPath: path.target.sectionPath,
        pageStart: path.target.pageStart,
        pageEnd: path.target.pageEnd,
        locator: path.target.locator,
        excerpt: path.target.title,
      });
    }

    return {
      paths,
      citations: [...dedupedCitations.values()],
      truncated,
      maxDepthReached: currentDepth >= maxDepth && frontier.length > 0,
    };
  },
};
