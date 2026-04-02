import type { AgentTool, ToolContext, ToolExecutionResult, ToolDefinition } from './tool.interface';
import type { Citation } from '@groundpath/shared/types';
import { searchService } from '@modules/rag/public/search';
import { documentRepository } from '@modules/document/public/repositories';
import { createLogger } from '@core/logger';

const logger = createLogger('kb-search.tool');

const KB_SEARCH_DEFINITION: ToolDefinition = {
  name: 'knowledge_base_search',
  description:
    'Search the associated knowledge base documents. Use this when the user question might be answered by uploaded documents.',
  category: 'fallback',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to find relevant document chunks',
      },
    },
    required: ['query'],
  },
};

export class KBSearchTool implements AgentTool {
  readonly definition = KB_SEARCH_DEFINITION;

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const query = String(args.query ?? '');
    if (!query.trim()) {
      return { content: 'Error: search query is empty.' };
    }
    if (!ctx.knowledgeBaseId) {
      return { content: 'No knowledge base is associated with this conversation.' };
    }

    logger.debug(
      { query: query.substring(0, 80), kbId: ctx.knowledgeBaseId },
      'KB search tool executing'
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
      return { content: 'No relevant documents found in the knowledge base.' };
    }

    // Batch-fetch document titles
    const docIds = [...new Set(rawResults.map((r) => r.documentId))];
    const docTitles = await documentRepository.getTitlesByIds(docIds);

    const citations: Citation[] = [];
    const parts: string[] = [];

    rawResults.forEach((r, idx) => {
      const title = docTitles.get(r.documentId) ?? 'Unknown Document';
      parts.push(`[Source ${idx + 1}: ${title}]\n${r.content}`);
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

    logger.debug({ resultCount: rawResults.length }, 'KB search tool completed');

    return {
      content: parts.join('\n\n---\n\n'),
      citations,
    };
  }
}
