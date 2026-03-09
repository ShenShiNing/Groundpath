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
    runtimeState: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    ctx.runtimeState = {};
  });

  it('returns error when nodeIds are missing', async () => {
    const tool = new NodeReadTool();
    const result = await tool.execute({ nodeIds: [] }, ctx);
    expect(result.content).toContain('requires at least one node ID');
    expect(mocks.service.read).not.toHaveBeenCalled();
  });

  it('returns JSON content and citations from service', async () => {
    mocks.service.read.mockResolvedValue({
      results: [
        {
          nodeId: 'node-1',
          title: 'Retrieval',
          locator: 'Chapter 1 / p.12',
          content: 'Body   with   spacing\n\n\nand gaps',
          truncated: false,
          remainingTokenEstimate: 0,
          parent: { nodeId: 'root', title: 'Doc Root' },
        },
      ],
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
    expect(result.content).toContain('"id":"node-1"');
    expect(result.content).toContain('"locator":"Chapter 1 / p.12"');
    expect(result.content).toContain('"content":"Body with spacing\\n\\nand gaps"');
    expect(result.content).not.toContain('\n  ');
    expect(result.citations).toHaveLength(1);
  });

  it('dedupes repeated node_read requests within the same conversation runtime state', async () => {
    mocks.service.read.mockResolvedValue({
      results: [
        {
          nodeId: 'node-1',
          title: 'Retrieval',
          locator: 'Chapter 1 / p.12',
          content: 'Body',
          truncated: false,
          remainingTokenEstimate: 0,
        },
      ],
      citations: [],
    });

    const tool = new NodeReadTool();

    await tool.execute({ nodeIds: ['node-1'] }, ctx);
    const secondResult = await tool.execute({ nodeIds: ['node-1'] }, ctx);

    expect(mocks.service.read).toHaveBeenCalledTimes(1);
    expect(secondResult.content).toContain('already read earlier');
  });
});
