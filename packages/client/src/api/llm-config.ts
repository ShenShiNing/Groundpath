import type {
  ApiResponse,
  LLMConfigInfo,
  LLMProviderInfo,
  TestLLMConnectionResponse,
  FetchModelsResponse,
} from '@groundpath/shared/types';
import type {
  UpdateLLMConfigInput,
  TestLLMConnectionInput,
  FetchModelsInput,
} from '@groundpath/shared/schemas';
import { apiClient, unwrapResponse } from '@/lib/http';

export const llmConfigApi = {
  /**
   * Get user's LLM configuration
   */
  async getConfig(): Promise<LLMConfigInfo | null> {
    const response = await apiClient.get<ApiResponse<LLMConfigInfo | null>>('/api/v1/llm/config');
    return unwrapResponse(response.data);
  },

  /**
   * Update LLM configuration
   */
  async updateConfig(data: UpdateLLMConfigInput): Promise<LLMConfigInfo> {
    const response = await apiClient.put<ApiResponse<LLMConfigInfo>>('/api/v1/llm/config', data);
    return unwrapResponse(response.data);
  },

  /**
   * Delete user's LLM configuration
   */
  async deleteConfig(): Promise<void> {
    const response = await apiClient.delete<ApiResponse<null>>('/api/v1/llm/config');
    unwrapResponse(response.data);
  },

  /**
   * Test provider connection
   */
  async testConnection(data: TestLLMConnectionInput = {}): Promise<TestLLMConnectionResponse> {
    const response = await apiClient.post<ApiResponse<TestLLMConnectionResponse>>(
      '/api/v1/llm/test-connection',
      data
    );
    return unwrapResponse(response.data);
  },

  /**
   * Get available providers and their models
   */
  async getProviders(): Promise<LLMProviderInfo[]> {
    const response = await apiClient.get<ApiResponse<LLMProviderInfo[]>>('/api/v1/llm/providers');
    return unwrapResponse(response.data);
  },

  /**
   * Fetch available models for a provider (dynamic)
   */
  async fetchModels(data: FetchModelsInput): Promise<FetchModelsResponse> {
    const response = await apiClient.post<ApiResponse<FetchModelsResponse>>(
      '/api/v1/llm/models',
      data
    );
    return unwrapResponse(response.data);
  },
};
