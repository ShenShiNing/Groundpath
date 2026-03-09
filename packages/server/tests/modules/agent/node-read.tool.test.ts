import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '@modules/agent/tools/tool.interface';

const mocks = vi.hoisted(() => ({
  service: {
    read: vi.fn(),
  },
}));

vi.mock('@modules/document-index/services/search/node-read.service', () => ({
  nodeReadService: mocks.service,
}));

import { NodeReadTool } from '@modules/agent/tools/node-read.tool';

describe('NodeReadTool', () => {
  const ctx: ToolContext = {
    userId: 'user-1',
    conversationId: 'conv-1',
    knowledgeBaseId: 'kb-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when nodeIds are missing', async () => {
    const tool = new NodeReadTool();
    const result = await tool.execute({ nodeIds: [] }, ctx);
    expect(result.content).toContain('requires at least one node ID');
    expect(mocks.service.read).not.toHaveBeenCalled();
  });

  it('returns JSON content and citations from service', async () => {
    mocks.service.read.mockResolvedValue({
      results: [{ nodeId: 'node-1', title: 'Retrieval', content: 'Body' }],
      citations: [
        {
          sourceType: 'node',
          nodeId: 'node-1',
          documentId: 'doc-1',
          documentTitle: 'Doc',
          excerpt: 'Body',
        },
      ],
    });

    const tool = new NodeReadTool();
    const result = await tool.execute({ nodeIds: ['node-1'], maxTokensPerNode: 1000 }, ctx);

    expect(mocks.service.read).toHaveBeenCalledWith(
      expect.objectContaining({ nodeIds: ['node-1'], maxTokensPerNode: 1000 })
    );
    expect(result.content).toContain('"nodeId": "node-1"');
    expect(result.citations).toHaveLength(1);
  });
});
