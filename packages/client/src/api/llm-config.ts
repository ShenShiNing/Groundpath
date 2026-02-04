import type {
  ApiResponse,
  LLMConfigInfo,
  LLMProviderInfo,
  TestLLMConnectionResponse,
  FetchModelsResponse,
} from '@knowledge-agent/shared/types';
import type {
  UpdateLLMConfigInput,
  TestLLMConnectionInput,
  FetchModelsInput,
} from '@knowledge-agent/shared/schemas';
import { apiClient, unwrapResponse } from '@/lib/http';

export const llmConfigApi = {
  /**
   * Get user's LLM configuration
   */
  async getConfig(): Promise<LLMConfigInfo | null> {
    const response = await apiClient.get<ApiResponse<LLMConfigInfo | null>>('/api/llm/config');
    return unwrapResponse(response.data);
  },

  /**
   * Update LLM configuration
   */
  async updateConfig(data: UpdateLLMConfigInput): Promise<LLMConfigInfo> {
    const response = await apiClient.put<ApiResponse<LLMConfigInfo>>('/api/llm/config', data);
    return unwrapResponse(response.data);
  },

  /**
   * Test provider connection
   */
  async testConnection(data: TestLLMConnectionInput = {}): Promise<TestLLMConnectionResponse> {
    const response = await apiClient.post<ApiResponse<TestLLMConnectionResponse>>(
      '/api/llm/test-connection',
      data
    );
    return unwrapResponse(response.data);
  },

  /**
   * Get available providers and their models
   */
  async getProviders(): Promise<LLMProviderInfo[]> {
    const response = await apiClient.get<ApiResponse<LLMProviderInfo[]>>('/api/llm/providers');
    return unwrapResponse(response.data);
  },

  /**
   * Fetch available models for a provider (dynamic)
   */
  async fetchModels(data: FetchModelsInput): Promise<FetchModelsResponse> {
    const response = await apiClient.post<ApiResponse<FetchModelsResponse>>(
      '/api/llm/models',
      data
    );
    return unwrapResponse(response.data);
  },
};
