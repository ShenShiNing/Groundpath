import type { AgentTool, ToolContext, ToolDefinition, ToolExecutionResult } from './tool.interface';
import { nodeReadService } from '@modules/document-index/public/search';

function compactContent(content: string): string {
  return content
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const NODE_READ_DEFINITION: ToolDefinition = {
  name: 'node_read',
  description:
    'Read the content of structured document nodes returned by outline_search. Use this after locating relevant nodes to inspect the actual section text and nearby context.',
  category: 'structured',
  parameters: {
    type: 'object',
    properties: {
      nodeIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'The structured node IDs to read',
      },
      maxTokensPerNode: {
        type: 'number',
        description: 'Maximum approximate tokens to return per node',
      },
    },
    required: ['nodeIds'],
  },
};

export class NodeReadTool implements AgentTool {
  readonly definition = NODE_READ_DEFINITION;

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const nodeIds = Array.isArray(args.nodeIds)
      ? [
          ...new Set(
            args.nodeIds.map((value) => String(value).trim()).filter((value) => value.length > 0)
          ),
        ]
      : [];

    if (nodeIds.length === 0) {
      return { content: 'Error: node_read requires at least one node ID.' };
    }

    const alreadyRead = new Set(ctx.runtimeState?.readNodeIds ?? []);
    const unreadNodeIds = nodeIds.filter((nodeId) => !alreadyRead.has(nodeId));
    if (unreadNodeIds.length === 0) {
      return {
        content:
          'All requested nodes were already read earlier in this conversation. Reuse that evidence unless you need different nodes.',
      };
    }

    const result = await nodeReadService.read({
      userId: ctx.userId,
      knowledgeBaseId: ctx.knowledgeBaseId,
      documentIds: ctx.documentIds,
      nodeIds: unreadNodeIds,
      maxTokensPerNode:
        typeof args.maxTokensPerNode === 'number' ? args.maxTokensPerNode : undefined,
    });

    if (result.results.length === 0) {
      return { content: 'No accessible structured nodes were found for reading.' };
    }

    if (ctx.runtimeState) {
      const nextReadNodeIds = new Set(ctx.runtimeState.readNodeIds ?? []);
      for (const item of result.results) {
        nextReadNodeIds.add(item.nodeId);
      }
      ctx.runtimeState.readNodeIds = [...nextReadNodeIds];
    }

    return {
      content: JSON.stringify({
        results: result.results.map((item) => ({
          id: item.nodeId,
          title: item.title,
          locator: item.locator,
          content: compactContent(item.content),
          truncated: item.truncated,
          remaining: item.remainingTokenEstimate,
          parent: item.parent ? { id: item.parent.nodeId, title: item.parent.title } : undefined,
          prev: item.prev ? { id: item.prev.nodeId, title: item.prev.title } : undefined,
          next: item.next ? { id: item.next.nodeId, title: item.next.title } : undefined,
        })),
      }),
      citations: result.citations,
    };
  }
}
