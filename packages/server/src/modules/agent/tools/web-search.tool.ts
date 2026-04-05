import type { AgentTool, ToolContext, ToolExecutionResult, ToolDefinition } from './tool.interface';
import { agentConfig, externalServiceConfig } from '@core/config/env';
import { Errors } from '@core/errors';
import { createLogger } from '@core/logger';
import { describeTextForLog } from '@core/logger/redaction';
import { executeExternalCall } from '@core/utils/external-call';

const logger = createLogger('web-search.tool');

/** Truncate text to maxLen, cutting at the last sentence/line boundary. */
function truncateAtBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;

  const slice = text.slice(0, maxLen);
  // Try to cut at the last sentence-ending punctuation or newline
  const boundaryMatch = slice.match(/.*[.。!！?？\n]/s);
  if (boundaryMatch) return boundaryMatch[0].trimEnd() + '…';

  // Fall back to last space
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.5) return slice.slice(0, lastSpace) + '…';

  return slice + '…';
}

const WEB_SEARCH_DEFINITION: ToolDefinition = {
  name: 'web_search',
  description:
    'Search the internet for up-to-date information. Use this when the question requires real-time data, current events, or information not available in the knowledge base.',
  category: 'external',
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
  raw_content?: string | null;
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

    const querySummary = describeTextForLog(query);
    logger.debug({ querySummary }, 'Web search tool executing');

    let data: TavilyResponse;
    try {
      data = await executeExternalCall<TavilyResponse>({
        service: 'web_search',
        operation: 'tavily.search',
        policy: { ...externalServiceConfig.webSearch, timeoutMs: agentConfig.toolTimeout },
        signal: ctx.signal,
        execute: (signal) =>
          fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key: apiKey,
              query,
              max_results: agentConfig.tavilyMaxResults,
              include_answer: false,
              include_raw_content: true,
            }),
            signal,
          }).then(async (response) => {
            if (!response.ok) {
              const errText = await response.text().catch(() => 'Unknown error');
              throw Errors.external(
                `Tavily API error: ${response.status} ${errText}`,
                undefined,
                response.status
              );
            }
            return (await response.json()) as TavilyResponse;
          }),
      });
    } catch (error) {
      const errText = error instanceof Error ? error.message : String(error);
      logger.warn({ querySummary, errText }, 'Tavily API error');
      return { content: `Web search failed: ${errText}` };
    }

    const results = data.results ?? [];

    if (results.length === 0) {
      return { content: 'No web search results found.' };
    }

    const maxLen = agentConfig.tavilyContentMaxLength;
    const parts = results.map((r, idx) => {
      const body = truncateAtBoundary(r.raw_content || r.content, maxLen);
      return `[${idx + 1}] ${r.title}\nURL: ${r.url}\n${body}`;
    });

    logger.debug({ resultCount: results.length }, 'Web search tool completed');

    return { content: parts.join('\n\n---\n\n') };
  }
}
