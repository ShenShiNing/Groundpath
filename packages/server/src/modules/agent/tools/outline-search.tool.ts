import type { AgentTool, ToolContext, ToolDefinition, ToolExecutionResult } from './tool.interface';
import { outlineSearchService } from '@modules/document-index/services/search/outline-search.service';

const OUTLINE_SEARCH_DEFINITION: ToolDefinition = {
  name: 'outline_search',
  description:
    'Search structured document outlines and section candidates in the associated knowledge base. Use this first to locate relevant chapters or sections before reading node content.',
  category: 'structured',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query used to locate relevant sections or nodes',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of outline candidates to return',
      },
      includeContentPreview: {
        type: 'boolean',
        description: 'Whether to include a short preview snippet for each candidate',
      },
    },
    required: ['query'],
  },
};

export class OutlineSearchTool implements AgentTool {
  readonly definition = OUTLINE_SEARCH_DEFINITION;

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const query = String(args.query ?? '').trim();
    if (!query) {
      return { content: 'Error: outline search query is empty.' };
    }

    const result = await outlineSearchService.search({
      userId: ctx.userId,
      knowledgeBaseId: ctx.knowledgeBaseId,
      documentIds: ctx.documentIds,
      query,
      limit: typeof args.limit === 'number' ? args.limit : undefined,
      includeContentPreview: Boolean(args.includeContentPreview),
    });

    if (result.results.length === 0) {
      return { content: 'No relevant outline sections found in the structured index.' };
    }

    return {
      content: JSON.stringify({ results: result.results }, null, 2),
      citations: result.citations,
    };
  }
}
