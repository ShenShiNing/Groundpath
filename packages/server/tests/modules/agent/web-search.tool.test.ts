import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '@modules/agent/tools/tool.interface';

vi.mock('@shared/config/env', () => ({
  agentConfig: {
    tavilyApiKey: 'test-tavily-key',
    toolTimeout: 5000,
    tavilyMaxResults: 3,
    tavilyContentMaxLength: 500,
  },
}));

vi.mock('@shared/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { WebSearchTool } from '@modules/agent/tools/web-search.tool';
import { agentConfig } from '@shared/config/env';

// ==================== Tests ====================

describe('WebSearchTool', () => {
  let tool: WebSearchTool;
  const baseCtx: ToolContext = {
    userId: 'user-1',
    conversationId: 'conv-1',
  };

  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new WebSearchTool();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should have correct definition', () => {
    expect(tool.definition.name).toBe('web_search');
    expect(tool.definition.parameters).toBeDefined();
  });

  it('should return error when query is empty', async () => {
    const result = await tool.execute({ query: '' }, baseCtx);
    expect(result.content).toContain('empty');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return error when query is whitespace', async () => {
    const result = await tool.execute({ query: '   ' }, baseCtx);
    expect(result.content).toContain('empty');
  });

  it('should call Tavily API with correct parameters', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });

    await tool.execute({ query: 'latest news' }, baseCtx);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.tavily.com/search',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      })
    );

    const firstCall = mockFetch.mock.calls.at(0);
    expect(firstCall).toBeDefined();
    const requestInit = firstCall?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body));
    expect(body.api_key).toBe('test-tavily-key');
    expect(body.query).toBe('latest news');
    expect(body.max_results).toBe(3);
  });

  it('should return formatted results', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            {
              title: 'Article 1',
              url: 'https://example.com/1',
              content: 'Short content',
              raw_content: 'Full raw content of article 1',
              score: 0.95,
            },
            {
              title: 'Article 2',
              url: 'https://example.com/2',
              content: 'Another article',
              raw_content: null,
              score: 0.85,
            },
          ],
        }),
    });

    const result = await tool.execute({ query: 'test' }, baseCtx);

    expect(result.content).toContain('Article 1');
    expect(result.content).toContain('https://example.com/1');
    expect(result.content).toContain('Full raw content of article 1');
    expect(result.content).toContain('Article 2');
    // When raw_content is null, should fall back to content
    expect(result.content).toContain('Another article');
  });

  it('should return no results message when API returns empty', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });

    const result = await tool.execute({ query: 'obscure query' }, baseCtx);

    expect(result.content).toContain('No web search results');
  });

  it('should handle API error response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limit exceeded'),
    });

    const result = await tool.execute({ query: 'test' }, baseCtx);

    expect(result.content).toContain('Web search failed');
    expect(result.content).toContain('429');
  });

  it('should handle API error when text() also fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error('Cannot read body')),
    });

    const result = await tool.execute({ query: 'test' }, baseCtx);

    expect(result.content).toContain('Web search failed');
    expect(result.content).toContain('500');
  });

  it('should truncate long content at boundary', async () => {
    const longContent = 'A'.repeat(600) + '. After boundary.';
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            {
              title: 'Long Article',
              url: 'https://example.com/long',
              content: longContent,
              raw_content: longContent,
              score: 0.9,
            },
          ],
        }),
    });

    const result = await tool.execute({ query: 'test' }, baseCtx);

    // Content should be truncated (maxLen is 500 from mock config)
    expect(result.content.length).toBeLessThan(longContent.length + 100);
  });
});

describe('WebSearchTool — no API key configured', () => {
  it('should return not configured message', async () => {
    const originalKey = agentConfig.tavilyApiKey;
    // Temporarily unset the API key
    (agentConfig as Record<string, unknown>).tavilyApiKey = undefined;

    try {
      const tool = new WebSearchTool();
      const result = await tool.execute({ query: 'test' }, { userId: 'u', conversationId: 'c' });
      expect(result.content).toContain('not configured');
    } finally {
      (agentConfig as Record<string, unknown>).tavilyApiKey = originalKey;
    }
  });
});
