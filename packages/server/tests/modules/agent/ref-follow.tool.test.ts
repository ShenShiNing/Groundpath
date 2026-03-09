import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '@modules/agent/tools/tool.interface';

const mocks = vi.hoisted(() => ({
  service: {
    follow: vi.fn(),
  },
}));

vi.mock('@modules/document-index/services/search/ref-follow.service', () => ({
  refFollowService: mocks.service,
}));

import { RefFollowTool } from '@modules/agent/tools/ref-follow.tool';

describe('RefFollowTool', () => {
  const ctx: ToolContext = {
    userId: 'user-1',
    conversationId: 'conv-1',
    knowledgeBaseId: 'kb-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when nodeId is missing', async () => {
    const tool = new RefFollowTool();
    const result = await tool.execute({ nodeId: ' ' }, ctx);
    expect(result.content).toContain('requires a nodeId');
    expect(mocks.service.follow).not.toHaveBeenCalled();
  });

  it('returns JSON path content and citations from service', async () => {
    mocks.service.follow.mockResolvedValue({
      paths: [{ depth: 1, fromNodeId: 'node-1', toNodeId: 'node-2', edgeType: 'refers_to' }],
      citations: [
        {
          sourceType: 'node',
          nodeId: 'node-2',
          documentId: 'doc-1',
          documentTitle: 'Doc',
          excerpt: 'Appendix',
        },
      ],
      truncated: false,
      maxDepthReached: false,
    });

    const tool = new RefFollowTool();
    const result = await tool.execute(
      { nodeId: 'node-1', depth: 2, edgeTypes: ['refers_to'] },
      ctx
    );

    expect(mocks.service.follow).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 'node-1',
        depth: 2,
        edgeTypes: ['refers_to'],
      })
    );
    expect(result.content).toContain('"edgeType": "refers_to"');
    expect(result.citations).toHaveLength(1);
  });
});
