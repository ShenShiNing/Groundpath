import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { LLMProviderType } from '@groundpath/shared/types';
import type { ModelInfo, FetchModelsOptions } from '../providers/llm-provider.interface';
import { externalServiceConfig } from '@config/env';
import { Errors } from '@core/errors';
import { logger } from '@core/logger';
import { executeExternalCall } from '@core/utils/external-call';

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
 * Service for fetching available models from different providers
 */
export const modelFetcherService = {
  /**
   * Fetch models from a specific provider
   */
  async fetchModels(provider: LLMProviderType, options: FetchModelsOptions): Promise<ModelInfo[]> {
    try {
      return await executeExternalCall({
        service: 'model_fetch',
        operation: provider,
        policy: externalServiceConfig.modelFetch,
        execute: (signal) => {
          switch (provider) {
            case 'openai':
              return this.fetchOpenAIModels(options, signal);
            case 'ollama':
              return this.fetchOllamaModels(options, signal);
            case 'deepseek':
              return this.fetchDeepSeekModels(options, signal);
            case 'zhipu':
              return this.fetchZhipuModels(options, signal);
            case 'anthropic':
              return this.fetchAnthropicModels(options, signal);
            case 'custom':
              return this.fetchCustomModels(options, signal);
            default:
              return Promise.resolve([]);
          }
        },
      });
    } catch (error) {
      const statusCode =
        (error as { statusCode?: number }).statusCode ?? (error as { status?: number }).status;
      const isTimeout =
        (error as { code?: string }).code === 'TIMEOUT' ||
        statusCode === 504 ||
        (error instanceof DOMException && error.name === 'AbortError');
      logger.warn(
        { error, provider, isTimeout },
        isTimeout
          ? `Model fetch timed out after ${externalServiceConfig.modelFetch.timeoutMs}ms`
          : 'Failed to fetch models'
      );
      return [];
    }
  },

  /**
   * Fetch models from OpenAI API
   */
  async fetchOpenAIModels(
    options: FetchModelsOptions,
    _signal?: AbortSignal
  ): Promise<ModelInfo[]> {
    if (!options.apiKey) {
      return [];
    }

    const client = new OpenAI({
      apiKey: options.apiKey,
      timeout: externalServiceConfig.modelFetch.timeoutMs,
      maxRetries: 0,
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
  async fetchOllamaModels(options: FetchModelsOptions, signal?: AbortSignal): Promise<ModelInfo[]> {
    const baseUrl = (options.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');

    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal,
    });

    if (!response.ok) {
      throw Errors.external(`Ollama API error: ${response.status}`, undefined, response.status);
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
  async fetchDeepSeekModels(
    options: FetchModelsOptions,
    signal?: AbortSignal
  ): Promise<ModelInfo[]> {
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
      signal,
    });

    if (!response.ok) {
      throw Errors.external(`DeepSeek API error: ${response.status}`, undefined, response.status);
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
  async fetchZhipuModels(options: FetchModelsOptions, signal?: AbortSignal): Promise<ModelInfo[]> {
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
      signal,
    });

    if (!response.ok) {
      throw Errors.external(`Zhipu API error: ${response.status}`, undefined, response.status);
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
  async fetchAnthropicModels(
    options: FetchModelsOptions,
    _signal?: AbortSignal
  ): Promise<ModelInfo[]> {
    if (!options.apiKey) {
      return [];
    }

    const client = new Anthropic({
      apiKey: options.apiKey,
      timeout: externalServiceConfig.modelFetch.timeoutMs,
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
  async fetchCustomModels(options: FetchModelsOptions, signal?: AbortSignal): Promise<ModelInfo[]> {
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
      signal,
    });

    if (!response.ok) {
      throw Errors.external(
        `Custom proxy API error: ${response.status}`,
        undefined,
        response.status
      );
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
