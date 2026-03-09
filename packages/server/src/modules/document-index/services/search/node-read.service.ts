import { agentConfig, documentIndexConfig } from '@config/env';
import type { Citation } from '@knowledge-agent/shared/types';
import { documentNodeRepository } from '../../repositories/document-node.repository';
import { documentNodeSearchRepository } from '../../repositories/document-node-search.repository';
import { documentIndexCacheService } from '../document-index-cache.service';

export interface NodeReadInput {
  userId: string;
  knowledgeBaseId?: string | null;
  documentIds?: string[];
  nodeIds: string[];
  maxTokensPerNode?: number;
}

interface RelatedNodeRef {
  nodeId: string;
  title: string;
  sectionPath: string[];
}

interface CachedIndexVersionNode {
  id: string;
  title: string | null;
  sectionPath: string[] | null;
  parentId: string | null;
  orderNo: number;
  stableLocator: string | null;
}

export interface NodeReadResultItem {
  nodeId: string;
  documentId: string;
  documentTitle: string;
  documentVersion: number;
  indexVersion: string;
  title: string;
  sectionPath: string[];
  content: string;
  locator: string;
  pageStart?: number;
  pageEnd?: number;
  truncated: boolean;
  remainingTokenEstimate: number;
  parent?: RelatedNodeRef;
  prev?: RelatedNodeRef;
  next?: RelatedNodeRef;
}

function estimateTokens(text: string): number {
  if (!text.trim()) return 0;
  return Math.ceil(text.length / documentIndexConfig.charsPerToken);
}

function truncateByTokens(text: string, maxTokens: number) {
  const maxChars = maxTokens * documentIndexConfig.charsPerToken;
  if (text.length <= maxChars) {
    return { content: text, truncated: false, remainingTokenEstimate: 0 };
  }

  const truncatedContent = `${text.slice(0, maxChars).trimEnd()}…`;
  return {
    content: truncatedContent,
    truncated: true,
    remainingTokenEstimate: Math.max(estimateTokens(text) - maxTokens, 0),
  };
}

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

function toRelatedNodeRef(row?: {
  id: string;
  title: string | null;
  stableLocator: string | null;
  sectionPath: string[] | null;
}): RelatedNodeRef | undefined {
  if (!row) return undefined;
  return {
    nodeId: row.id,
    title: row.title || row.stableLocator || row.sectionPath?.join(' > ') || row.id,
    sectionPath: row.sectionPath ?? [],
  };
}

export const nodeReadService = {
  async read(input: NodeReadInput): Promise<{
    results: NodeReadResultItem[];
    citations: Citation[];
  }> {
    const uniqueNodeIds = [...new Set(input.nodeIds.map((nodeId) => nodeId.trim()).filter(Boolean))];
    if (uniqueNodeIds.length === 0) {
      return { results: [], citations: [] };
    }

    const maxTokensPerNode = input.maxTokensPerNode ?? agentConfig.maxNodeReadTokens;
    return documentIndexCacheService.getNodeReadResult(
      {
        userId: input.userId,
        knowledgeBaseId: input.knowledgeBaseId,
        documentIds: input.documentIds,
        nodeIds: uniqueNodeIds,
        maxTokensPerNode,
      },
      async () => {
        const rows = await documentNodeSearchRepository.getAccessibleNodesByIds({
          userId: input.userId,
          knowledgeBaseId: input.knowledgeBaseId,
          documentIds: input.documentIds,
          nodeIds: uniqueNodeIds,
        });

        if (rows.length === 0) {
          return { results: [], citations: [] };
        }

        const indexVersionMaps = new Map<
          string,
          {
            byId: Map<string, CachedIndexVersionNode>;
            byOrder: Map<number, CachedIndexVersionNode>;
          }
        >();

        for (const indexVersionId of [...new Set(rows.map((row) => row.indexVersionId))]) {
          const nodes = await documentIndexCacheService.getIndexVersionNodes(indexVersionId, () =>
            documentNodeRepository.listByIndexVersionId(indexVersionId)
          );
          indexVersionMaps.set(indexVersionId, {
            byId: new Map(nodes.map((node) => [node.id, node])),
            byOrder: new Map(nodes.map((node) => [node.orderNo, node])),
          });
        }

        const rowByNodeId = new Map(rows.map((row) => [row.nodeId, row]));
        const results: NodeReadResultItem[] = [];
        for (const nodeId of uniqueNodeIds) {
          const row = rowByNodeId.get(nodeId);
          if (!row) continue;

          const item = await documentIndexCacheService.getNodeReadItem(
            {
              documentId: row.documentId,
              nodeId,
              maxTokensPerNode,
            },
            async () => {
              const content = row.content ?? '';
              const truncation = truncateByTokens(content, maxTokensPerNode);
              const maps = indexVersionMaps.get(row.indexVersionId);
              const parentNode = row.parentId ? maps?.byId.get(row.parentId) : undefined;
              const prevNode = maps?.byOrder.get(row.orderNo - 1);
              const nextNode = maps?.byOrder.get(row.orderNo + 1);

              return {
                nodeId: row.nodeId,
                documentId: row.documentId,
                documentTitle: row.documentTitle,
                documentVersion: row.documentVersion,
                indexVersion: row.indexVersion,
                title: row.title || row.stableLocator || row.sectionPath?.join(' > ') || row.nodeId,
                sectionPath: row.sectionPath ?? [],
                content: truncation.content,
                locator: toLocator(row),
                pageStart: row.pageStart ?? undefined,
                pageEnd: row.pageEnd ?? undefined,
                truncated: truncation.truncated,
                remainingTokenEstimate: truncation.remainingTokenEstimate,
                parent: toRelatedNodeRef(parentNode),
                prev: toRelatedNodeRef(prevNode),
                next: toRelatedNodeRef(nextNode),
              } satisfies NodeReadResultItem;
            }
          );
          results.push(item);
        }

        const citations: Citation[] = results.map((row) => ({
          sourceType: 'node',
          documentId: row.documentId,
          documentTitle: row.documentTitle,
          documentVersion: row.documentVersion,
          indexVersion: row.indexVersion,
          nodeId: row.nodeId,
          sectionPath: row.sectionPath,
          pageStart: row.pageStart,
          pageEnd: row.pageEnd,
          locator: row.locator,
          excerpt: row.content,
        }));

        return { results, citations };
      }
    );
  },
};
