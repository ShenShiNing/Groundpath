import type { AgentTool, ToolContext, ToolDefinition, ToolExecutionResult } from './tool.interface';
import { nodeReadService } from '@modules/document-index/services/search/node-read.service';

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
      ? args.nodeIds.map((value) => String(value).trim()).filter((value) => value.length > 0)
      : [];

    if (nodeIds.length === 0) {
      return { content: 'Error: node_read requires at least one node ID.' };
    }

    const result = await nodeReadService.read({
      userId: ctx.userId,
      knowledgeBaseId: ctx.knowledgeBaseId,
      documentIds: ctx.documentIds,
      nodeIds,
      maxTokensPerNode:
        typeof args.maxTokensPerNode === 'number' ? args.maxTokensPerNode : undefined,
    });

    if (result.results.length === 0) {
      return { content: 'No accessible structured nodes were found for reading.' };
    }

    return {
      content: JSON.stringify({ results: result.results }, null, 2),
      citations: result.citations,
    };
  }
}
