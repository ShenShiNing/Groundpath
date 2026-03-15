import type { AgentTool, ToolContext, ToolDefinition, ToolExecutionResult } from './tool.interface';
import { refFollowService } from '@modules/document-index/services/search';

const REF_FOLLOW_DEFINITION: ToolDefinition = {
  name: 'ref_follow',
  description:
    'Traverse structured document graph edges such as parent, next, refers_to, or cites from a starting node. Use this when a section points to related chapters, appendices, or follow-up sections.',
  category: 'structured',
  parameters: {
    type: 'object',
    properties: {
      nodeId: {
        type: 'string',
        description: 'The starting structured node ID',
      },
      depth: {
        type: 'number',
        description: 'Maximum traversal depth',
      },
      edgeTypes: {
        type: 'array',
        items: { type: 'string', enum: ['parent', 'next', 'refers_to', 'cites'] },
        description: 'The edge types to follow',
      },
    },
    required: ['nodeId'],
  },
};

export class RefFollowTool implements AgentTool {
  readonly definition = REF_FOLLOW_DEFINITION;

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
    const nodeId = String(args.nodeId ?? '').trim();
    if (!nodeId) {
      return { content: 'Error: ref_follow requires a nodeId.' };
    }

    const edgeTypes = Array.isArray(args.edgeTypes)
      ? args.edgeTypes
          .map((value) => String(value))
          .filter((value): value is 'parent' | 'next' | 'refers_to' | 'cites' =>
            ['parent', 'next', 'refers_to', 'cites'].includes(value)
          )
      : undefined;

    const result = await refFollowService.follow({
      userId: ctx.userId,
      knowledgeBaseId: ctx.knowledgeBaseId,
      documentIds: ctx.documentIds,
      nodeId,
      depth: typeof args.depth === 'number' ? args.depth : undefined,
      edgeTypes,
    });

    if (result.paths.length === 0) {
      return { content: 'No graph edges were found to follow from this node.' };
    }

    return {
      content: JSON.stringify(
        {
          paths: result.paths,
          truncated: result.truncated,
          maxDepthReached: result.maxDepthReached,
        },
        null,
        2
      ),
      citations: result.citations,
    };
  }
}
