import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { llmConfigApi } from '@/api';
import { queryKeys } from '@/lib/query';
import type { LLMProviderType } from '@knowledge-agent/shared/types';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('settings');

  return useMutation({
    mutationFn: llmConfigApi.updateConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.llm.config });
      // Invalidate all model queries since credentials may have changed
      queryClient.invalidateQueries({ queryKey: ['llm', 'models'] });
      toast.success(t('toast.saved'));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('toast.saveFailed'));
    },
  });
}

/**
 * Hook to delete LLM configuration
 */
export function useDeleteLLMConfig() {
  const queryClient = useQueryClient();
  const { t } = useTranslation('settings');

  return useMutation({
    mutationFn: llmConfigApi.deleteConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.llm.config });
      queryClient.invalidateQueries({ queryKey: ['llm', 'models'] });
      toast.success(t('toast.cleared'));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('toast.clearFailed'));
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
