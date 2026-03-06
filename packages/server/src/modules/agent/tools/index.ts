import type { AgentTool, ToolContext } from './tool.interface';
import { agentConfig } from '@shared/config/env';
import { KBSearchTool } from './kb-search.tool';
import { WebSearchTool } from './web-search.tool';

export type { AgentTool, ToolContext, ToolExecutionResult, ToolDefinition } from './tool.interface';
export { KBSearchTool } from './kb-search.tool';
export { WebSearchTool } from './web-search.tool';

export function resolveTools(ctx: ToolContext): AgentTool[] {
  const tools: AgentTool[] = [];
  if (ctx.knowledgeBaseId) tools.push(new KBSearchTool());
  if (agentConfig.tavilyApiKey) tools.push(new WebSearchTool());
  return tools;
}
