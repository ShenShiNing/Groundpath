import type { Citation } from '@knowledge-agent/shared/types';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ToolContext {
  userId: string;
  conversationId: string;
  knowledgeBaseId?: string | null;
  documentIds?: string[];
  signal?: AbortSignal;
}

export interface ToolExecutionResult {
  content: string;
  citations?: Citation[];
}

export interface AgentTool {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult>;
}
