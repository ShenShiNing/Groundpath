import type {
  AgentMessage,
  ChatMessage,
  GenerateOptions,
  LLMProvider,
} from '@modules/llm/public/runtime';
import type { AgentTool, ToolContext } from './tools';
import type {
  AgentStep,
  AgentStopReason,
  Citation,
  ToolCallInfo,
  ToolResultInfo,
} from '@groundpath/shared/types';

export interface AgentExecutorOptions {
  provider: LLMProvider;
  messages: ChatMessage[];
  tools: AgentTool[];
  toolContext: ToolContext;
  genOptions: GenerateOptions;
  maxIterations?: number;
  onToolStart?: (stepIndex: number, toolCalls: ToolCallInfo[]) => void;
  onToolEnd?: (stepIndex: number, results: ToolResultInfo[], durationMs: number) => void;
}

export interface AgentExecutorResult {
  content: string;
  citations: Citation[];
  retrievedCitations: Citation[];
  agentTrace: AgentStep[];
  stopReason?: AgentStopReason;
  agentMessages?: AgentMessage[];
}

export interface TaggedCitation {
  citation: Citation;
  toolName: string;
  normalizedScore?: number;
}

export interface BuildAgentExecutorResultInput {
  content: string;
  stopReason: AgentStopReason;
  citations: TaggedCitation[];
  agentTrace: AgentStep[];
  tools: AgentTool[];
  agentMessages?: AgentMessage[];
}

export interface GenerateWithoutToolsInput {
  provider: LLMProvider;
  agentMessages: AgentMessage[];
  genOptions: GenerateOptions;
  stopReason: AgentStopReason;
  citations: TaggedCitation[];
  agentTrace: AgentStep[];
  tools: AgentTool[];
}

export interface ExecuteToolCallsInput {
  toolCalls: ToolCallInfo[];
  toolMap: Map<string, AgentTool>;
  toolContext: ToolContext;
}

export interface ExecuteToolCallsResult {
  toolResults: ToolResultInfo[];
  citations: TaggedCitation[];
  sawToolTimeout: boolean;
  durationMs: number;
}

export interface ToolCategoryCounts {
  structured: number;
  fallback: number;
  external: number;
}
