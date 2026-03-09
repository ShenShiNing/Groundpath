import type { AgentTool, ToolContext } from './tool.interface';
import { agentConfig } from '@shared/config/env';
import { KBSearchTool } from './kb-search.tool';
import { OutlineSearchTool } from './outline-search.tool';
import { NodeReadTool } from './node-read.tool';
import { RefFollowTool } from './ref-follow.tool';
import { VectorFallbackSearchTool } from './vector-fallback-search.tool';
import { WebSearchTool } from './web-search.tool';
import { structuredRagRolloutService } from '@modules/document-index/services/structured-rag-rollout.service';

export type { AgentTool, ToolContext, ToolExecutionResult, ToolDefinition } from './tool.interface';
export { KBSearchTool } from './kb-search.tool';
export { OutlineSearchTool } from './outline-search.tool';
export { NodeReadTool } from './node-read.tool';
export { RefFollowTool } from './ref-follow.tool';
export { VectorFallbackSearchTool } from './vector-fallback-search.tool';
export { WebSearchTool } from './web-search.tool';

export function resolveTools(ctx: ToolContext): AgentTool[] {
  const tools: AgentTool[] = [];
  if (ctx.knowledgeBaseId) {
    if (
      structuredRagRolloutService.isEnabledForTarget({
        userId: ctx.userId,
        knowledgeBaseId: ctx.knowledgeBaseId,
      })
    ) {
      tools.push(
        new OutlineSearchTool(),
        new NodeReadTool(),
        new RefFollowTool(),
        new VectorFallbackSearchTool()
      );
    } else {
      tools.push(new KBSearchTool());
    }
  }
  if (agentConfig.tavilyApiKey) tools.push(new WebSearchTool());
  return tools;
}
