import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { llmConfigApi } from '@/api/llm-config';
import { queryKeys } from '@/lib/queryClient';
import type { LLMProviderType } from '@knowledge-agent/shared/types';

/**
 * Hook to fetch user's current LLM configuration
 */
export function useLLMConfig() {
  return useQuery({
    queryKey: queryKeys.llm.config,
    queryFn: llmConfigApi.getConfig,
  });
}

/**
 * Hook to fetch available LLM providers
 */
export function useLLMProviders() {
  return useQuery({
    queryKey: queryKeys.llm.providers,
    queryFn: llmConfigApi.getProviders,
  });
}

interface UseLLMModelsOptions {
  apiKey?: string;
  baseUrl?: string | null;
  enabled?: boolean;
}

/**
 * Hook to fetch available models for a provider
 */
export function useLLMModels(provider: LLMProviderType, options: UseLLMModelsOptions = {}) {
  const { apiKey, baseUrl, enabled = true } = options;

  return useQuery({
    queryKey: queryKeys.llm.models(provider, !!apiKey, baseUrl ?? null),
    queryFn: () =>
      llmConfigApi.fetchModels({
        provider,
        apiKey: apiKey || undefined,
        baseUrl: baseUrl || undefined,
      }),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to update LLM configuration
 */
export function useUpdateLLMConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: llmConfigApi.updateConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.llm.config });
      // Invalidate all model queries since credentials may have changed
      queryClient.invalidateQueries({ queryKey: ['llm', 'models'] });
      toast.success('AI settings saved successfully');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to save settings');
    },
  });
}

/**
 * Hook to test LLM connection
 */
export function useTestLLMConnection() {
  return useMutation({
    mutationFn: llmConfigApi.testConnection,
  });
}
