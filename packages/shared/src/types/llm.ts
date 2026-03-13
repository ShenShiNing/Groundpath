// LLM Provider types
export const LLM_PROVIDERS = [
  'openai',
  'anthropic',
  'zhipu',
  'deepseek',
  'ollama',
  'custom',
] as const;
export type LLMProviderType = (typeof LLM_PROVIDERS)[number];

// User's LLM configuration (API response, key masked)
export interface LLMConfigInfo {
  id: string;
  userId: string;
  provider: LLMProviderType;
  model: string;
  apiKeyMasked: string | null; // Last 4 chars only, e.g., "****1234"
  hasApiKey: boolean;
  apiKeyStatus?: 'missing' | 'valid' | 'unreadable';
  baseUrl: string | null;
  temperature: number;
  maxTokens: number;
  topP: number;
  createdAt: Date;
  updatedAt: Date;
}

// Request to update LLM config
export interface UpdateLLMConfigRequest {
  provider?: LLMProviderType;
  model?: string;
  apiKey?: string; // Full API key (only sent when updating)
  baseUrl?: string | null;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

// Test connection request
export interface TestLLMConnectionRequest {
  provider?: LLMProviderType;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

// Test connection response
export interface TestLLMConnectionResponse {
  success: boolean;
  message: string;
  latencyMs?: number;
}

// Provider info for frontend dropdown
export interface LLMProviderInfo {
  provider: LLMProviderType;
  name: string;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean; // true for custom provider
  optionalBaseUrl?: boolean; // show base URL field but don't require it (e.g. Ollama)
  defaultBaseUrl?: string;
}

// Model info from dynamic fetch
export interface LLMModelInfo {
  id: string;
  name?: string;
  created?: number;
  owned_by?: string;
}

// Request to fetch available models
export interface FetchModelsRequest {
  provider: LLMProviderType;
  apiKey?: string;
  baseUrl?: string;
}

// Response from fetch models
export interface FetchModelsResponse {
  models: LLMModelInfo[];
  fromCache: boolean;
}

// Error code type
export type LLMErrorCode =
  (typeof import('../constants').LLM_ERROR_CODES)[keyof typeof import('../constants').LLM_ERROR_CODES];
