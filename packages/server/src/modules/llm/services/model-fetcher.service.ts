import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { LLMProviderType } from '@knowledge-agent/shared/types';
import type { ModelInfo, FetchModelsOptions } from '../providers/llm-provider.interface';
import { llmConfig } from '@config/env';
import { Errors } from '@core/errors';
import { logger } from '@core/logger';

interface OllamaTagsResponse {
  models: Array<{
    name: string;
    modified_at: string;
    size: number;
  }>;
}

interface OpenAIModelsResponse {
  data: Array<{
    id: string;
    created: number;
    owned_by: string;
  }>;
}

/** Known OpenAI chat model prefixes */
const OPENAI_CHAT_MODEL_PREFIXES = ['gpt-', 'o1-', 'o3-', 'o4-'];

/**
 * Create an AbortSignal that times out after configured ms
 */
function createTimeoutSignal(): AbortSignal {
  return AbortSignal.timeout(llmConfig.modelFetchTimeout);
}

/**
 * Service for fetching available models from different providers
 */
export const modelFetcherService = {
  /**
   * Fetch models from a specific provider
   */
  async fetchModels(provider: LLMProviderType, options: FetchModelsOptions): Promise<ModelInfo[]> {
    try {
      switch (provider) {
        case 'openai':
          return await this.fetchOpenAIModels(options);
        case 'ollama':
          return await this.fetchOllamaModels(options);
        case 'deepseek':
          return await this.fetchDeepSeekModels(options);
        case 'zhipu':
          return await this.fetchZhipuModels(options);
        case 'anthropic':
          return await this.fetchAnthropicModels(options);
        case 'custom':
          return await this.fetchCustomModels(options);
        default:
          return [];
      }
    } catch (error) {
      const isTimeout = error instanceof DOMException && error.name === 'AbortError';
      logger.warn(
        { error, provider, isTimeout },
        isTimeout
          ? `Model fetch timed out after ${llmConfig.modelFetchTimeout}ms`
          : 'Failed to fetch models'
      );
      return [];
    }
  },

  /**
   * Fetch models from OpenAI API
   */
  async fetchOpenAIModels(options: FetchModelsOptions): Promise<ModelInfo[]> {
    if (!options.apiKey) {
      return [];
    }

    const client = new OpenAI({
      apiKey: options.apiKey,
      timeout: llmConfig.modelFetchTimeout,
    });

    const response = await client.models.list();
    const models: ModelInfo[] = [];

    for await (const model of response) {
      const isOpenAIModel =
        OPENAI_CHAT_MODEL_PREFIXES.some((prefix) => model.id.startsWith(prefix)) &&
        !model.id.includes('instruct');

      if (isOpenAIModel) {
        models.push({
          id: model.id,
          name: model.id,
          created: model.created,
          owned_by: model.owned_by,
        });
      }
    }

    // Sort by created date (newest first) and name
    models.sort((a, b) => {
      if (b.created && a.created) {
        return b.created - a.created;
      }
      return a.id.localeCompare(b.id);
    });

    return models;
  },

  /**
   * Fetch models from Ollama local server
   */
  async fetchOllamaModels(options: FetchModelsOptions): Promise<ModelInfo[]> {
    const baseUrl = (options.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');

    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: createTimeoutSignal(),
    });

    if (!response.ok) {
      throw Errors.external(`Ollama API error: ${response.status}`);
    }

    const data = (await response.json()) as OllamaTagsResponse;

    if (!data.models || data.models.length === 0) {
      return [];
    }

    return data.models.map((m) => ({
      id: m.name,
      name: m.name,
    }));
  },

  /**
   * Fetch models from DeepSeek API
   */
  async fetchDeepSeekModels(options: FetchModelsOptions): Promise<ModelInfo[]> {
    if (!options.apiKey) {
      return [];
    }

    const baseUrl = 'https://api.deepseek.com';

    const response = await fetch(`${baseUrl}/v1/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: createTimeoutSignal(),
    });

    if (!response.ok) {
      throw Errors.external(`DeepSeek API error: ${response.status}`);
    }

    const data = (await response.json()) as OpenAIModelsResponse;

    if (!data.data || data.data.length === 0) {
      return [];
    }

    return data.data.map((m) => ({
      id: m.id,
      name: m.id,
      created: m.created,
      owned_by: m.owned_by,
    }));
  },

  /**
   * Fetch models from Zhipu API
   */
  async fetchZhipuModels(options: FetchModelsOptions): Promise<ModelInfo[]> {
    if (!options.apiKey) {
      return [];
    }

    const baseUrl = 'https://open.bigmodel.cn/api/paas/v4';

    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: createTimeoutSignal(),
    });

    if (!response.ok) {
      throw Errors.external(`Zhipu API error: ${response.status}`);
    }

    const data = (await response.json()) as OpenAIModelsResponse;

    if (!data.data || data.data.length === 0) {
      return [];
    }

    // Filter to only text/chat models (glm-*)
    const chatModels = data.data.filter((m) => m.id.startsWith('glm-'));

    return chatModels.map((m) => ({
      id: m.id,
      name: m.id,
      created: m.created,
      owned_by: m.owned_by,
    }));
  },

  /**
   * Fetch models from Anthropic official API
   */
  async fetchAnthropicModels(options: FetchModelsOptions): Promise<ModelInfo[]> {
    if (!options.apiKey) {
      return [];
    }

    const client = new Anthropic({
      apiKey: options.apiKey,
      timeout: llmConfig.modelFetchTimeout,
    });

    const models: ModelInfo[] = [];

    try {
      for await (const model of client.beta.models.list()) {
        models.push({
          id: model.id,
          name: model.display_name ?? model.id,
        });
      }
    } catch (error) {
      logger.warn({ error, provider: 'anthropic' }, 'Failed to fetch models from beta API');
      return [];
    }

    return models;
  },

  /**
   * Fetch all available models from third-party proxy (OpenAI-compatible /v1/models)
   */
  async fetchCustomModels(options: FetchModelsOptions): Promise<ModelInfo[]> {
    if (!options.apiKey || !options.baseUrl) {
      return [];
    }

    const baseUrl = normalizeCustomBaseUrl(options.baseUrl);

    const response = await fetch(`${baseUrl}/v1/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: createTimeoutSignal(),
    });

    if (!response.ok) {
      throw Errors.external(`Custom proxy API error: ${response.status}`);
    }

    const data = (await response.json()) as OpenAIModelsResponse;

    if (!data.data || data.data.length === 0) {
      return [];
    }

    return data.data.map((m) => ({
      id: m.id,
      name: m.id,
      created: m.created,
      owned_by: m.owned_by,
    }));
  },
};

function normalizeCustomBaseUrl(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1\/chat\/completions$/i, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/v1\/models$/i, '')
    .replace(/\/models$/i, '')
    .replace(/\/v1$/i, '');
}
