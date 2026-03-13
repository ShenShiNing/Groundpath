import React, { useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useForm, useStore } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  useDeleteLLMConfig,
  useLLMConfig,
  useLLMModels,
  useLLMProviders,
  useTestLLMConnection,
  useUpdateLLMConfig,
} from '@/hooks';
import { canFetchModels, useAISettingsStore } from '@/stores';
import { AISettingsActions } from '@/components/settings/ai/sections/AISettingsActions';
import { AISettingsCredentialsSection } from '@/components/settings/ai/sections/AISettingsCredentialsSection';
import { AISettingsModelSection } from '@/components/settings/ai/sections/AISettingsModelSection';
import type { LLMProviderType } from '@knowledge-agent/shared/types';
import type { AISettingsFormValues } from './types';
import { getProviderCapabilities } from './utils';

export function AISettingsForm() {
  const { t } = useTranslation('settings');
  const [clearDialogOpen, setClearDialogOpen] = React.useState(false);
  const { data: config, isLoading, isError } = useLLMConfig();
  const { data: providers = [] } = useLLMProviders();
  const updateMutation = useUpdateLLMConfig();
  const deleteMutation = useDeleteLLMConfig();
  const testMutation = useTestLLMConnection();

  const showApiKey = useAISettingsStore((state) => state.showApiKey);
  const pendingApiKey = useAISettingsStore((state) => state.pendingApiKey);
  const pendingBaseUrl = useAISettingsStore((state) => state.pendingBaseUrl);
  const toggleShowApiKey = useAISettingsStore((state) => state.toggleShowApiKey);
  const setPendingApiKey = useAISettingsStore((state) => state.setPendingApiKey);
  const setPendingBaseUrl = useAISettingsStore((state) => state.setPendingBaseUrl);
  const resetPendingCredentials = useAISettingsStore((state) => state.resetPendingCredentials);
  const reset = useAISettingsStore((state) => state.reset);

  useEffect(() => {
    reset();
  }, [config?.id, reset]);

  const form = useForm({
    defaultValues: {
      provider: config?.provider ?? 'openai',
      model: config?.model ?? '',
      apiKey: '',
      baseUrl: config?.baseUrl ?? '',
    } satisfies AISettingsFormValues,
  });

  useEffect(() => {
    form.setFieldValue('provider', config?.provider ?? 'openai');
    form.setFieldValue('model', config?.model ?? '');
    form.setFieldValue('apiKey', '');
    form.setFieldValue('baseUrl', config?.baseUrl ?? '');
  }, [config?.baseUrl, config?.id, config?.model, config?.provider, form]);

  const values = useStore(form.store, (state) => state.values);

  const currentProvider = useMemo(
    () => providers.find((provider) => provider.provider === values.provider),
    [providers, values.provider]
  );

  const providerCapabilities = useMemo(
    () => getProviderCapabilities(values.provider, currentProvider),
    [currentProvider, values.provider]
  );

  const isCustomProvider = values.provider === 'custom';
  const isOllamaProvider = values.provider === 'ollama';
  const requiresApiKey = isCustomProvider ? true : providerCapabilities.requiresApiKey;
  const requiresBaseUrl = isCustomProvider ? true : providerCapabilities.requiresBaseUrl;
  const optionalBaseUrl = isOllamaProvider ? true : providerCapabilities.optionalBaseUrl;
  const defaultBaseUrl =
    isOllamaProvider && !providerCapabilities.defaultBaseUrl
      ? 'http://localhost:11434'
      : providerCapabilities.defaultBaseUrl;

  const canFetch = canFetchModels(
    values.provider,
    !!(config?.hasApiKey && config.provider === values.provider),
    pendingApiKey,
    values.baseUrl,
    pendingBaseUrl
  );

  const showApiKeyField = requiresApiKey;
  const showBaseUrlField = requiresBaseUrl || optionalBaseUrl;

  const {
    data: modelsData,
    isLoading: modelsLoading,
    isError: modelsError,
    refetch: refetchModels,
  } = useLLMModels(values.provider, {
    apiKey: pendingApiKey ?? undefined,
    baseUrl: showBaseUrlField ? (pendingBaseUrl ?? values.baseUrl) || undefined : undefined,
    enabled: canFetch,
  });

  const models = modelsData?.models ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        {t('form.loadError')}
      </div>
    );
  }

  const isSaving = updateMutation.isPending;
  const isClearing = deleteMutation.isPending;
  const isBusy = isSaving || isClearing;
  const hasSavedKey = !!(config?.hasApiKey && config.provider === values.provider);
  const hasUnreadableSavedKey = !!(
    config?.apiKeyStatus === 'unreadable' && config.provider === values.provider
  );
  const hasModel = !!values.model;
  const canTestConnection =
    !isBusy &&
    !testMutation.isPending &&
    !(showApiKeyField && !hasSavedKey && !values.apiKey) &&
    !(requiresBaseUrl && !values.baseUrl);
  const canSave = !isBusy && hasModel;

  function resetFormAfterClear() {
    form.setFieldValue('provider', 'openai');
    form.setFieldValue('model', '');
    form.setFieldValue('apiKey', '');
    form.setFieldValue('baseUrl', '');
    resetPendingCredentials();
  }

  function handleProviderChange(newProvider: LLMProviderType) {
    form.setFieldValue('provider', newProvider);
    form.setFieldValue('model', '');
    form.setFieldValue('apiKey', '');
    if (newProvider !== 'custom') {
      form.setFieldValue('baseUrl', '');
    }
    resetPendingCredentials();
  }

  function handleApiKeyChange(nextValue: string) {
    form.setFieldValue('apiKey', nextValue);
    setPendingApiKey(nextValue.trim() || null);
  }

  function handleBaseUrlChange(nextValue: string) {
    form.setFieldValue('baseUrl', nextValue);
    setPendingBaseUrl(nextValue.trim() || null);
  }

  function handleTest() {
    testMutation.mutate(
      {
        ...(values.model && { model: values.model }),
        ...(values.provider !== config?.provider && { provider: values.provider }),
        ...(values.apiKey && { apiKey: values.apiKey }),
        ...(values.baseUrl && { baseUrl: values.baseUrl }),
      },
      {
        onSuccess: (result) => {
          if (result.success) {
            toast.success(
              result.latencyMs !== undefined
                ? t('form.testSuccessLatency', { latency: result.latencyMs })
                : t('form.testSuccess')
            );
          } else {
            toast.error(t('form.testFailed'), {
              description: result.message,
            });
          }
        },
        onError: (error) => {
          toast.error(t('form.testError'), {
            description: error instanceof Error ? error.message : undefined,
          });
        },
      }
    );
  }

  function handleSave() {
    if (!values.model) {
      toast.error(t('form.modelRequired'));
      return;
    }

    updateMutation.mutate(
      {
        provider: values.provider,
        model: values.model,
        baseUrl: values.baseUrl || null,
        ...(values.apiKey && { apiKey: values.apiKey }),
      },
      {
        onSuccess: () => {
          form.setFieldValue('apiKey', '');
          resetPendingCredentials();
        },
      }
    );
  }

  function handleRefreshModels() {
    if (canFetch) {
      refetchModels();
      return;
    }

    if (requiresApiKey && requiresBaseUrl) {
      toast.error(t('form.apiKeyAndBaseUrlRequired'));
      return;
    }

    if (requiresApiKey) {
      toast.error(t('form.apiKeyRequired'));
    }
  }

  function handleClearConfig() {
    if (!config) {
      return;
    }

    deleteMutation.mutate(undefined, {
      onSuccess: () => {
        resetFormAfterClear();
        setClearDialogOpen(false);
      },
    });
  }

  return (
    <div className="space-y-8">
      <AISettingsCredentialsSection
        config={config}
        providers={providers}
        values={values}
        isBusy={isBusy}
        showApiKeyField={showApiKeyField}
        showApiKey={showApiKey}
        hasSavedKey={hasSavedKey}
        showUnreadableApiKeyWarning={hasUnreadableSavedKey}
        showBaseUrlField={showBaseUrlField}
        optionalBaseUrl={optionalBaseUrl}
        defaultBaseUrl={defaultBaseUrl}
        onProviderChange={handleProviderChange}
        onApiKeyChange={handleApiKeyChange}
        onBaseUrlChange={handleBaseUrlChange}
        onToggleShowApiKey={toggleShowApiKey}
      />

      <div className="border-t" />

      <AISettingsModelSection
        model={values.model}
        models={models}
        modelsLoading={modelsLoading}
        modelsError={modelsError}
        canFetch={canFetch}
        requiresApiKey={requiresApiKey}
        requiresBaseUrl={requiresBaseUrl}
        isBusy={isBusy}
        onModelChange={(value) => form.setFieldValue('model', value)}
        onRefresh={handleRefreshModels}
      />

      <div className="border-t" />

      <AISettingsActions
        clearDialogOpen={clearDialogOpen}
        hasConfig={!!config}
        isBusy={isBusy}
        isSaving={isSaving}
        isClearing={isClearing}
        isTesting={testMutation.isPending}
        canSave={canSave}
        canTest={canTestConnection}
        onClearDialogOpenChange={setClearDialogOpen}
        onClearConfig={handleClearConfig}
        onTest={handleTest}
        onSave={handleSave}
      />
    </div>
  );
}
