import type { LLMProviderType, ToolCallInfo } from '@knowledge-agent/shared/types';
import type { ToolDefinition } from '@modules/agent/tools/tool.interface';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  signal?: AbortSignal;
}

export interface ModelInfo {
  id: string;
  name?: string;
  created?: number;
  owned_by?: string;
}

// --- Agent / Tool call types ---

export type AgentMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCallInfo[] }
  | { role: 'tool'; content: string; toolCallId: string };

export interface ToolGenerateResult {
  finishReason: 'text' | 'tool_calls';
  content?: string;
  toolCalls?: ToolCallInfo[];
}

export interface GenerateWithToolsOptions extends GenerateOptions {
  tools: ToolDefinition[];
}

// --- Stream chunk types ---

export type StreamChunk = { type: 'content'; text: string } | { type: 'reasoning'; text: string };

// --- Provider interfaces ---

export interface LLMProvider {
  readonly name: LLMProviderType;

  /**
   * Generate a complete response from messages.
   */
  generate(messages: ChatMessage[], options?: GenerateOptions): Promise<string>;

  /**
   * Stream generate response chunks.
   * Supports AbortSignal via options.signal for cancellation.
   */
  streamGenerate(
    messages: ChatMessage[],
    options?: GenerateOptions
  ): AsyncGenerator<StreamChunk, void, unknown>;

  /**
   * Check if the provider is reachable with current credentials.
   */
  healthCheck(): Promise<boolean>;

  /**
   * Generate a response that may include tool calls (optional).
   * If not implemented, agent executor falls back to plain generate.
   */
  generateWithTools?(
    messages: AgentMessage[],
    options: GenerateWithToolsOptions
  ): Promise<ToolGenerateResult>;
}

/**
 * Options for fetching models from a provider
 */
export interface FetchModelsOptions {
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Model fetcher interface for each provider
 */
export interface ModelFetcher {
  /**
   * Fetch available models from the provider API
   * Returns null if the provider doesn't support dynamic model listing
   */
  fetchModels(options: FetchModelsOptions): Promise<ModelInfo[] | null>;
}
