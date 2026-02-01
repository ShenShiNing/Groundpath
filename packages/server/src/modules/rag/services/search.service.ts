import { createLogger } from '@shared/logger';
import { getEmbeddingProviderByType } from '@modules/embedding';
import { vectorRepository, ensureCollection } from '@modules/vector';
import type { SearchResult } from '@modules/vector';
import type { EmbeddingProviderType } from '@knowledge-agent/shared/types';
import { knowledgeBaseService } from '@modules/knowledge-base';

const logger = createLogger('search.service');

export interface KBSearchOptions {
  userId: string;
  knowledgeBaseId: string;
  query: string;
  limit?: number;
  scoreThreshold?: number;
  documentIds?: string[];
}

export const searchService = {
  /**
   * Search within a specific knowledge base
   */
  async searchInKnowledgeBase(options: KBSearchOptions): Promise<SearchResult[]> {
    const { userId, knowledgeBaseId, query, limit, scoreThreshold, documentIds } = options;

    logger.debug(
      { userId, knowledgeBaseId, query: query.substring(0, 50), limit },
      'Performing KB semantic search'
    );

    // Get KB embedding config
    const embeddingConfig = await knowledgeBaseService.getEmbeddingConfig(knowledgeBaseId);
    const { provider, dimensions, collectionName } = embeddingConfig;

    // Ensure collection exists
    await ensureCollection(collectionName, dimensions);

    // Generate query embedding using the KB's provider
    const embeddingProvider = getEmbeddingProviderByType(provider as EmbeddingProviderType);
    const queryVector = await embeddingProvider.embed(query);

    // Search in Qdrant with KB filter
    const results = await vectorRepository.search(collectionName, queryVector, userId, {
      limit,
      scoreThreshold,
      documentIds,
      knowledgeBaseId,
    });

    logger.debug(
      { userId, knowledgeBaseId, resultCount: results.length, collectionName },
      'KB search completed'
    );
    return results;
  },
};
