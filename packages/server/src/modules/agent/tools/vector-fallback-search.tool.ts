import type { AgentTool, ToolContext, ToolExecutionResult, ToolDefinition } from './tool.interface';
import type { Citation } from '@groundpath/shared/types';
import { searchService } from '@modules/rag';
import { documentRepository } from '@modules/document';
import { createLogger } from '@core/logger';

const logger = createLogger('vector-fallback-search.tool');

const VECTOR_FALLBACK_SEARCH_DEFINITION: ToolDefinition = {
  name: 'vector_fallback_search',
  description:
    'Search the knowledge base with vector similarity as a fallback when structured outline and node evidence are insufficient.',
  category: 'fallback',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The fallback search query to find relevant document chunks',
      },
    },
    required: ['query'],
  },
};

export class VectorFallbackSearchTool implements AgentTool {
  readonly definition = VECTOR_FALLBACK_SEARCH_DEFINITION;

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const query = String(args.query ?? '');
    if (!query.trim()) {
      return { content: 'Error: fallback search query is empty.' };
    }
    if (!ctx.knowledgeBaseId) {
      return { content: 'No knowledge base is associated with this conversation.' };
    }

    logger.debug(
      { query: query.substring(0, 80), kbId: ctx.knowledgeBaseId },
      'Vector fallback search tool executing'
    );

    const rawResults = await searchService.searchInKnowledgeBase({
      userId: ctx.userId,
      knowledgeBaseId: ctx.knowledgeBaseId,
      query,
      limit: 5,
      scoreThreshold: 0.5,
      documentIds: ctx.documentIds,
    });

    if (rawResults.length === 0) {
      return { content: 'No relevant fallback results found in the knowledge base.' };
    }

    const docIds = [...new Set(rawResults.map((r) => r.documentId))];
    const docTitles = await documentRepository.getTitlesByIds(docIds);

    const citations: Citation[] = [];
    const parts: string[] = [];

    rawResults.forEach((r, idx) => {
      const title = docTitles.get(r.documentId) ?? 'Unknown Document';
      parts.push(`[Fallback Source ${idx + 1}: ${title}]\n${r.content}`);
      citations.push({
        sourceType: 'chunk',
        documentId: r.documentId,
        documentTitle: title,
        chunkIndex: r.chunkIndex,
        content: r.content,
        excerpt: r.content,
        score: r.score,
      });
    });

    logger.debug({ resultCount: rawResults.length }, 'Vector fallback search completed');

    return {
      content: parts.join('\n\n---\n\n'),
      citations,
    };
  }
}
