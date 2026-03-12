import { ragConfig } from '@config/env';
import { createLogger } from '@shared/logger';
import { getEmbeddingProviderByType } from '@modules/embedding';
import { vectorRepository, ensureCollection } from '@modules/vector';
import type { SearchResult } from '@modules/vector';
import type { EmbeddingProviderType } from '@knowledge-agent/shared/types';
import { knowledgeBaseService } from '@modules/knowledge-base';
import { documentRepository } from '@modules/document';

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
    const targetLimit = limit ?? 5;
    const searchOverfetchFactor = ragConfig.searchOverfetchFactor;
    const searchMaxCandidates = ragConfig.searchMaxCandidates;

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
    let fetchLimit = Math.min(
      Math.max(targetLimit * searchOverfetchFactor, targetLimit),
      searchMaxCandidates
    );
    let filteredResults: SearchResult[] = [];

    while (fetchLimit <= searchMaxCandidates) {
      const candidates = await vectorRepository.search(collectionName, queryVector, userId, {
        limit: fetchLimit,
        scoreThreshold,
        documentIds,
        knowledgeBaseId,
      });

      const activeIndexVersionMap = await documentRepository.getActiveIndexVersionMap([
        ...new Set(candidates.map((result) => result.documentId)),
      ]);

      filteredResults = candidates.filter((result) => {
        const activeIndexVersionId = activeIndexVersionMap.get(result.documentId);
        return (
          typeof activeIndexVersionId === 'string' &&
          activeIndexVersionId.length > 0 &&
          result.indexVersionId === activeIndexVersionId
        );
      });

      if (filteredResults.length >= targetLimit || candidates.length < fetchLimit) {
        break;
      }

      if (fetchLimit === searchMaxCandidates) {
        break;
      }

      fetchLimit = Math.min(fetchLimit * 2, searchMaxCandidates);
    }

    logger.debug(
      { userId, knowledgeBaseId, resultCount: filteredResults.length, collectionName },
      'KB search completed'
    );
    return filteredResults.slice(0, targetLimit);
  },
};
