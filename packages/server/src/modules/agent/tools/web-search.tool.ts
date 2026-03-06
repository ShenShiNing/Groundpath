import type { AgentTool, ToolContext, ToolExecutionResult, ToolDefinition } from './tool.interface';
import { agentConfig } from '@shared/config/env';
import { createLogger } from '@shared/logger';

const logger = createLogger('web-search.tool');

const WEB_SEARCH_DEFINITION: ToolDefinition = {
  name: 'web_search',
  description:
    'Search the internet for up-to-date information. Use this when the question requires real-time data, current events, or information not available in the knowledge base.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query',
      },
    },
    required: ['query'],
  },
};

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results: TavilyResult[];
}

export class WebSearchTool implements AgentTool {
  readonly definition = WEB_SEARCH_DEFINITION;

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const query = String(args.query ?? '');
    if (!query.trim()) {
      return { content: 'Error: search query is empty.' };
    }

    const apiKey = agentConfig.tavilyApiKey;
    if (!apiKey) {
      return { content: 'Web search is not configured.' };
    }

    logger.debug({ query: query.substring(0, 80) }, 'Web search tool executing');

    const timeoutSignal = AbortSignal.timeout(agentConfig.toolTimeout);
    const signals = ctx.signal ? [ctx.signal, timeoutSignal] : [timeoutSignal];
    const combinedSignal = AbortSignal.any(signals);

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: agentConfig.tavilyMaxResults,
        include_answer: false,
      }),
      signal: combinedSignal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      logger.warn({ status: response.status, errText }, 'Tavily API error');
      return { content: `Web search failed: ${response.status} ${errText}` };
    }

    const data = (await response.json()) as TavilyResponse;
    const results = data.results ?? [];

    if (results.length === 0) {
      return { content: 'No web search results found.' };
    }

    const parts = results.map((r, idx) => `[${idx + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`);

    logger.debug({ resultCount: results.length }, 'Web search tool completed');

    return { content: parts.join('\n\n---\n\n') };
  }
}
