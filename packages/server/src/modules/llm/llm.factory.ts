import type { LLMProviderType } from '@knowledge-agent/shared/types';
import type { LLMProvider } from './providers/llm-provider.interface';
import { OpenAIProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { ZhipuProvider } from './providers/zhipu.provider';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { CustomProvider } from './providers/custom.provider';
import { llmConfig } from '@config/env';
import { Errors } from '@shared/errors';

export interface LLMProviderConfig {
  apiKey?: string;
  model: string;
  baseUrl?: string;
}

/**
 * Create an LLM provider instance with user-provided configuration.
 * Unlike the embedding factory, LLM providers are NOT cached because
 * each user may have different API keys and settings.
 *
 * Fallback keys come exclusively from llmConfig (never from embeddingConfig).
 */
export function createLLMProvider(type: LLMProviderType, config: LLMProviderConfig): LLMProvider {
  const { apiKey, model, baseUrl } = config;

  switch (type) {
    case 'openai': {
      const key = apiKey ?? llmConfig.openaiApiKey;
      if (!key) throw Errors.validation('OpenAI API key is required');
      return new OpenAIProvider(key, model);
    }
    case 'anthropic': {
      const key = apiKey ?? llmConfig.anthropicApiKey;
      if (!key) throw Errors.validation('Anthropic API key is required');
      return new AnthropicProvider(key, model);
    }
    case 'zhipu': {
      const key = apiKey ?? llmConfig.zhipuApiKey;
      if (!key) throw Errors.validation('Zhipu API key is required');
      return new ZhipuProvider(key, model);
    }
    case 'deepseek': {
      const key = apiKey ?? llmConfig.deepseek.apiKey;
      if (!key) throw Errors.validation('DeepSeek API key is required');
      return new DeepSeekProvider(key, model);
    }
    case 'ollama': {
      return new OllamaProvider(model, baseUrl ?? llmConfig.ollamaBaseUrl);
    }
    case 'custom': {
      if (!apiKey) throw Errors.validation('API key is required for custom provider');
      if (!baseUrl) throw Errors.validation('Base URL is required for custom provider');
      return new CustomProvider(apiKey, model, baseUrl);
    }
    default:
      throw Errors.validation(`Unknown LLM provider: ${type}`);
  }
}
