import type {
  LLMConfigInfo,
  LLMModelInfo,
  LLMProviderInfo,
  LLMProviderType,
} from '@knowledge-agent/shared/types';

export interface AISettingsFormValues {
  provider: LLMProviderType;
  model: string;
  apiKey: string;
  baseUrl: string;
}

export interface AIProviderCapabilities {
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  optionalBaseUrl: boolean;
  defaultBaseUrl?: string;
}

export type AISettingsConfig = LLMConfigInfo | null | undefined;
export type AISettingsProviderInfo = LLMProviderInfo;
export type AISettingsModelInfo = LLMModelInfo;
