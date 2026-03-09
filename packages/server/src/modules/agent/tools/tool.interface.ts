import type { Citation } from '@knowledge-agent/shared/types';

export type ToolCategory = 'structured' | 'fallback' | 'external';

export interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ToolContext {
  userId: string;
  conversationId: string;
  knowledgeBaseId?: string | null;
  documentIds?: string[];
  signal?: AbortSignal;
  runtimeState?: {
    readNodeIds?: string[];
    toolResultCache?: Record<string, ToolExecutionResult>;
  };
}

export interface ToolExecutionResult {
  content: string;
  citations?: Citation[];
}

export interface AgentTool {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult>;
}
