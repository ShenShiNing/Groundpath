import type { LLMProviderType } from '@knowledge-agent/shared/types';
import type { LLMProvider } from './providers/llm-provider.interface';
import { OpenAIProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { ZhipuProvider } from './providers/zhipu.provider';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { CustomProvider } from './providers/custom.provider';
import { env } from '@config/env';

export interface LLMProviderConfig {
  apiKey?: string;
  model: string;
  baseUrl?: string;
}

/**
 * Create an LLM provider instance with user-provided configuration.
 * Unlike the embedding factory, LLM providers are NOT cached because
 * each user may have different API keys and settings.
 */
export function createLLMProvider(type: LLMProviderType, config: LLMProviderConfig): LLMProvider {
  const { apiKey, model, baseUrl } = config;

  switch (type) {
    case 'openai': {
      const key = apiKey ?? env.OPENAI_API_KEY;
      if (!key) throw new Error('OpenAI API key is required');
      return new OpenAIProvider(key, model);
    }
    case 'anthropic': {
      const key = apiKey ?? env.ANTHROPIC_API_KEY;
      if (!key) throw new Error('Anthropic API key is required');
      return new AnthropicProvider(key, model);
    }
    case 'zhipu': {
      const key = apiKey ?? env.ZHIPU_API_KEY;
      if (!key) throw new Error('Zhipu API key is required');
      return new ZhipuProvider(key, model);
    }
    case 'deepseek': {
      const key = apiKey ?? env.DEEPSEEK_API_KEY;
      if (!key) throw new Error('DeepSeek API key is required');
      return new DeepSeekProvider(key, model);
    }
    case 'ollama': {
      return new OllamaProvider(model, baseUrl ?? env.OLLAMA_BASE_URL);
    }
    case 'custom': {
      if (!apiKey) throw new Error('API key is required for custom provider');
      if (!baseUrl) throw new Error('Base URL is required for custom provider');
      return new CustomProvider(apiKey, model, baseUrl);
    }
    default:
      throw new Error(`Unknown LLM provider: ${type}`);
  }
}
