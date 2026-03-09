import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '@modules/agent/tools/tool.interface';

const mocks = vi.hoisted(() => ({
  service: {
    search: vi.fn(),
  },
}));

vi.mock('@modules/document-index/services/search/outline-search.service', () => ({
  outlineSearchService: mocks.service,
}));

import { OutlineSearchTool } from '@modules/agent/tools/outline-search.tool';

describe('OutlineSearchTool', () => {
  const ctx: ToolContext = {
    userId: 'user-1',
    conversationId: 'conv-1',
    knowledgeBaseId: 'kb-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error on empty query', async () => {
    const tool = new OutlineSearchTool();
    const result = await tool.execute({ query: '   ' }, ctx);
    expect(result.content).toContain('empty');
    expect(mocks.service.search).not.toHaveBeenCalled();
  });

  it('returns JSON content and citations from service', async () => {
    mocks.service.search.mockResolvedValue({
      results: [{ nodeId: 'node-1', title: 'Retrieval' }],
      citations: [
        {
          sourceType: 'node',
          nodeId: 'node-1',
          documentId: 'doc-1',
          documentTitle: 'Doc',
          excerpt: 'preview',
        },
      ],
    });

    const tool = new OutlineSearchTool();
    const result = await tool.execute({ query: 'retrieval', limit: 3 }, ctx);

    expect(mocks.service.search).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'retrieval', limit: 3 })
    );
    expect(result.content).toContain('"nodeId": "node-1"');
    expect(result.citations).toHaveLength(1);
  });
});
