import type { LLMProviderType } from '@groundpath/shared/types';
import type { LLMProvider } from './providers/llm-provider.interface';
import { OpenAIProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { ZhipuProvider } from './providers/zhipu.provider';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { CustomProvider } from './providers/custom.provider';
import { Errors } from '@core/errors';

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
 * API keys must come from the user's saved config (DB) — there are no
 * server-level fallback keys.
 */
export function createLLMProvider(type: LLMProviderType, config: LLMProviderConfig): LLMProvider {
  const { apiKey, model, baseUrl } = config;

  switch (type) {
    case 'openai': {
      if (!apiKey) throw Errors.validation('OpenAI API key is required');
      return new OpenAIProvider(apiKey, model);
    }
    case 'anthropic': {
      if (!apiKey) throw Errors.validation('Anthropic API key is required');
      return new AnthropicProvider(apiKey, model);
    }
    case 'zhipu': {
      if (!apiKey) throw Errors.validation('Zhipu API key is required');
      return new ZhipuProvider(apiKey, model);
    }
    case 'deepseek': {
      if (!apiKey) throw Errors.validation('DeepSeek API key is required');
      return new DeepSeekProvider(apiKey, model);
    }
    case 'ollama': {
      return new OllamaProvider(model, baseUrl ?? 'http://localhost:11434');
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
