import { cacheService, shortCache } from '@shared/cache';
import { createLogger } from '@shared/logger';

const logger = createLogger('document-index-cache.service');

const OUTLINE_SEARCH_TTL_SECONDS = 45;
const NODE_READ_TTL_SECONDS = 30;
const NODE_READ_ITEM_TTL_SECONDS = 90;
const NODE_PREVIEW_TTL_SECONDS = 600;
const INDEX_VERSION_NODES_TTL_SECONDS = 600;

interface CacheableNodeRow {
  id: string;
  indexVersionId: string;
  title: string | null;
  stableLocator: string | null;
  sectionPath: string[] | null;
  parentId: string | null;
  orderNo: number;
}

function normalizeList(values?: string[]): string {
  if (!values?.length) return '-';
  return [...values].sort().join(',');
}

async function safeGetOrSet<T>(
  scope: 'short' | 'long',
  key: string,
  ttlSeconds: number,
  factory: () => Promise<T>
): Promise<T> {
  try {
    if (scope === 'short') {
      return await shortCache.getOrSet(key, factory, ttlSeconds);
    }
    return await cacheService.getOrSet(key, factory, ttlSeconds);
  } catch (error) {
    logger.warn({ key, scope, err: error }, 'Document index cache unavailable, falling back');
    return factory();
  }
}

export const documentIndexCacheService = {
  async getOutlineSearch<T>(
    input: {
      userId: string;
      knowledgeBaseId?: string | null;
      documentIds?: string[];
      query: string;
      limit: number;
      includeContentPreview: boolean;
    },
    factory: () => Promise<T>
  ): Promise<T> {
    const key = [
      'document-index:outline-search',
      input.userId,
      input.knowledgeBaseId ?? '-',
      normalizeList(input.documentIds),
      input.limit,
      input.includeContentPreview ? 'preview' : 'no-preview',
      input.query.trim().toLowerCase(),
    ].join(':');

    return safeGetOrSet('short', key, OUTLINE_SEARCH_TTL_SECONDS, factory);
  },

  async getNodeReadResult<T>(
    input: {
      userId: string;
      knowledgeBaseId?: string | null;
      documentIds?: string[];
      nodeIds: string[];
      maxTokensPerNode: number;
    },
    factory: () => Promise<T>
  ): Promise<T> {
    const key = [
      'document-index:node-read',
      input.userId,
      input.knowledgeBaseId ?? '-',
      normalizeList(input.documentIds),
      input.maxTokensPerNode,
      input.nodeIds.join(','),
    ].join(':');

    return safeGetOrSet('short', key, NODE_READ_TTL_SECONDS, factory);
  },

  async getNodeReadItem<T>(
    input: {
      documentId: string;
      nodeId: string;
      maxTokensPerNode: number;
    },
    factory: () => Promise<T>
  ): Promise<T> {
    const key = [
      'document-index:node-read-item',
      input.documentId,
      input.nodeId,
      input.maxTokensPerNode,
    ].join(':');

    return safeGetOrSet('short', key, NODE_READ_ITEM_TTL_SECONDS, factory);
  },

  async getIndexVersionNodes(
    indexVersionId: string,
    factory: () => Promise<CacheableNodeRow[]>
  ): Promise<CacheableNodeRow[]> {
    return safeGetOrSet(
      'long',
      `document-index:index-version-nodes:${indexVersionId}`,
      INDEX_VERSION_NODES_TTL_SECONDS,
      factory
    );
  },

  async getNodePreview(documentId: string, nodeId: string): Promise<string | null> {
    try {
      return await cacheService.get<string>(`document-index:node-preview:${documentId}:${nodeId}`);
    } catch (error) {
      logger.warn({ documentId, nodeId, err: error }, 'Node preview cache lookup failed');
      return null;
    }
  },

  async setNodePreview(documentId: string, nodeId: string, preview: string): Promise<void> {
    try {
      await cacheService.set(
        `document-index:node-preview:${documentId}:${nodeId}`,
        preview,
        NODE_PREVIEW_TTL_SECONDS
      );
    } catch (error) {
      logger.warn({ documentId, nodeId, err: error }, 'Node preview cache write failed');
    }
  },

  async invalidateDocumentCaches(documentId: string, indexVersionId?: string): Promise<void> {
    try {
      await Promise.all([
        cacheService.deleteByPrefix(`document-index:node-preview:${documentId}:`),
        shortCache.deleteByPrefix(`document-index:node-read-item:${documentId}:`),
        indexVersionId
          ? cacheService.deleteByPrefix(`document-index:index-version-nodes:${indexVersionId}`)
          : Promise.resolve(0),
      ]);
    } catch (error) {
      logger.warn(
        { documentId, indexVersionId, err: error },
        'Document index cache invalidation failed'
      );
    }
  },

  async invalidateQueryCaches(input: {
    userId?: string;
    knowledgeBaseId?: string | null;
  }): Promise<void> {
    if (!input.userId || !input.knowledgeBaseId) return;

    try {
      await Promise.all([
        shortCache.deleteByPrefix(
          `document-index:outline-search:${input.userId}:${input.knowledgeBaseId}:`
        ),
        shortCache.deleteByPrefix(
          `document-index:node-read:${input.userId}:${input.knowledgeBaseId}:`
        ),
      ]);
    } catch (error) {
      logger.warn(
        { userId: input.userId, knowledgeBaseId: input.knowledgeBaseId, err: error },
        'Document index query cache invalidation failed'
      );
    }
  },
};
