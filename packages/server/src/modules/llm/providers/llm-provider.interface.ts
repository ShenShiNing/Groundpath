import type { LLMProviderType } from '@knowledge-agent/shared/types';

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
  ): AsyncGenerator<string, void, unknown>;

  /**
   * Check if the provider is reachable with current credentials.
   */
  healthCheck(): Promise<boolean>;
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
