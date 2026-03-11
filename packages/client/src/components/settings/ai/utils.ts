import type { LLMProviderType } from '@knowledge-agent/shared/types';
import type { AIProviderCapabilities, AISettingsProviderInfo } from './types';

export function getProviderCapabilities(
  provider: LLMProviderType,
  currentProvider?: AISettingsProviderInfo
): AIProviderCapabilities {
  if (currentProvider) {
    return {
      requiresApiKey: !!currentProvider.requiresApiKey,
      requiresBaseUrl: !!currentProvider.requiresBaseUrl,
      optionalBaseUrl: !!currentProvider.optionalBaseUrl,
      defaultBaseUrl: currentProvider.defaultBaseUrl,
    };
  }

  if (provider === 'custom') {
    return {
      requiresApiKey: true,
      requiresBaseUrl: true,
      optionalBaseUrl: false,
      defaultBaseUrl: undefined,
    };
  }

  if (provider === 'ollama') {
    return {
      requiresApiKey: false,
      requiresBaseUrl: false,
      optionalBaseUrl: true,
      defaultBaseUrl: 'http://localhost:11434',
    };
  }

  return {
    requiresApiKey: true,
    requiresBaseUrl: false,
    optionalBaseUrl: false,
    defaultBaseUrl: undefined,
  };
}
