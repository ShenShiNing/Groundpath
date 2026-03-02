import React, { useEffect, useMemo } from 'react';
import { useForm } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { Loader2, Eye, EyeOff, RefreshCw, Zap, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
} from '@/components/ui/combobox';
import {
  useLLMConfig,
  useLLMProviders,
  useLLMModels,
  useUpdateLLMConfig,
  useDeleteLLMConfig,
  useTestLLMConnection,
} from '@/hooks/useLLMConfig';
import { useAISettingsStore, canFetchModels } from '@/stores/aiSettingsStore';
import type { LLMProviderType } from '@knowledge-agent/shared/types';

export function AISettingsForm() {
  const { t } = useTranslation('settings');
  const [clearDialogOpen, setClearDialogOpen] = React.useState(false);
  const { data: config, isLoading, isError } = useLLMConfig();
  const { data: providers = [] } = useLLMProviders();
  const updateMutation = useUpdateLLMConfig();
  const deleteMutation = useDeleteLLMConfig();
  const testMutation = useTestLLMConnection();

  // Zustand — fine-grained selectors
  const showApiKey = useAISettingsStore((s) => s.showApiKey);
  const pendingApiKey = useAISettingsStore((s) => s.pendingApiKey);
  const pendingBaseUrl = useAISettingsStore((s) => s.pendingBaseUrl);
  const toggleShowApiKey = useAISettingsStore((s) => s.toggleShowApiKey);
  const setPendingApiKey = useAISettingsStore((s) => s.setPendingApiKey);
  const setPendingBaseUrl = useAISettingsStore((s) => s.setPendingBaseUrl);
  const resetPendingCredentials = useAISettingsStore((s) => s.resetPendingCredentials);
  const reset = useAISettingsStore((s) => s.reset);

  useEffect(() => {
    reset();
  }, [config?.id, reset]);

  const form = useForm({
    defaultValues: {
      provider: config?.provider ?? 'openai',
      model: config?.model ?? '',
      apiKey: '',
      baseUrl: config?.baseUrl ?? '',
    },
  });

  const values = form.state.values;

  const currentProvider = useMemo(
    () => providers.find((p) => p.provider === values.provider),
    [providers, values.provider]
  );

  const canFetch = canFetchModels(
    values.provider,
    !!(config?.hasApiKey && config.provider === values.provider),
    pendingApiKey,
    values.baseUrl,
    pendingBaseUrl
  );

  const showBaseUrlField = !!currentProvider?.requiresBaseUrl || !!currentProvider?.optionalBaseUrl;

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
  const showApiKeyField = !!currentProvider?.requiresApiKey;
  const hasSavedKey = !!(config?.hasApiKey && config.provider === values.provider);
  const hasModel = !!values.model;

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
            toast.error(
              result.message === 'Provider health check failed'
                ? t('form.testFailed')
                : result.message
            );
          }
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : t('form.testError');
          toast.error(message === 'Provider health check failed' ? t('form.testFailed') : message);
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
    } else if (currentProvider?.requiresApiKey && currentProvider?.requiresBaseUrl) {
      toast.error(t('form.apiKeyAndBaseUrlRequired'));
    } else if (currentProvider?.requiresApiKey) {
      toast.error(t('form.apiKeyRequired'));
    }
  }

  function handleClearConfig() {
    if (!config) return;

    deleteMutation.mutate(undefined, {
      onSuccess: () => {
        resetFormAfterClear();
        setClearDialogOpen(false);
      },
    });
  }

  return (
    <div className="space-y-6">
      {/* Provider */}
      <form.Field name="provider">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="provider">{t('form.provider')}</Label>
            <Select
              value={field.state.value}
              onValueChange={(v) => handleProviderChange(v as LLMProviderType)}
              disabled={isBusy}
            >
              <SelectTrigger id="provider">
                <SelectValue placeholder={t('form.providerPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.provider} value={p.provider}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('form.providerHelper')}</p>
          </div>
        )}
      </form.Field>

      {/* API Key */}
      {showApiKeyField && (
        <form.Field name="apiKey">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="apiKey">
                API Key
                {hasSavedKey && config?.apiKeyMasked && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t('form.currentApiKey', { masked: config.apiKeyMasked })}
                  </span>
                )}
              </Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={() => {
                    field.handleBlur();
                    if (field.state.value.trim()) {
                      setPendingApiKey(field.state.value.trim());
                    }
                  }}
                  placeholder={
                    hasSavedKey ? t('form.apiKeyPlaceholderUpdate') : t('form.apiKeyPlaceholder')
                  }
                  disabled={isBusy}
                  className="pr-10"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={toggleShowApiKey}
                  disabled={isBusy}
                  aria-label={showApiKey ? t('form.hideApiKey') : t('form.showApiKey')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {values.provider === 'custom'
                  ? t('form.apiKeyHelperCustom')
                  : t('form.apiKeyHelper')}
              </p>
            </div>
          )}
        </form.Field>
      )}

      {/* Base URL */}
      {showBaseUrlField && (
        <form.Field name="baseUrl">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="baseUrl">
                Base URL
                {currentProvider?.optionalBaseUrl && (
                  <span className="ml-2 text-xs text-muted-foreground">{t('form.optional')}</span>
                )}
              </Label>
              <Input
                id="baseUrl"
                type="url"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={() => {
                  field.handleBlur();
                  if (field.state.value.trim()) {
                    setPendingBaseUrl(field.state.value.trim());
                  }
                }}
                placeholder={currentProvider?.defaultBaseUrl ?? 'https://api.example.com'}
                disabled={isBusy}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                {currentProvider?.optionalBaseUrl
                  ? t('form.baseUrlHelperOptional', {
                      defaultUrl: currentProvider.defaultBaseUrl ?? '',
                    })
                  : t('form.baseUrlHelper')}
              </p>
            </div>
          )}
        </form.Field>
      )}

      {/* Model */}
      <form.Field name="model">
        {(field) => (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="model">{t('form.model')}</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRefreshModels}
                disabled={modelsLoading}
                className="h-6 px-2 text-xs"
              >
                {modelsLoading ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3 w-3" />
                )}
                {t('form.refresh')}
              </Button>
            </div>
            <ModelSelector
              value={field.state.value}
              models={models}
              isLoading={modelsLoading}
              isError={modelsError}
              canFetch={canFetch}
              requiresApiKey={!!currentProvider?.requiresApiKey}
              disabled={isBusy}
              onValueChange={(v) => field.handleChange(v)}
            />
            <p className="text-xs text-muted-foreground">{t('form.modelHelper')}</p>
          </div>
        )}
      </form.Field>

      {/* Actions */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={
              isBusy ||
              testMutation.isPending ||
              !hasModel ||
              (showApiKeyField && !hasSavedKey && !values.apiKey) ||
              (currentProvider?.requiresBaseUrl && !values.baseUrl)
            }
          >
            {testMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Zap className="mr-2 h-4 w-4" />
            )}
            {t('form.testConnection')}
          </Button>

          <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" disabled={!config || isBusy}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t('form.clearConfig')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>{t('form.clearConfirmTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('form.clearConfirmDescription')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isClearing}>{t('common:cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={isClearing}
                  onClick={handleClearConfig}
                >
                  {isClearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t('form.clearConfirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button type="button" onClick={handleSave} disabled={isBusy || !hasModel}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t('form.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ModelSelectorProps {
  value: string;
  models: { id: string; name?: string }[];
  isLoading: boolean;
  isError: boolean;
  canFetch: boolean;
  requiresApiKey: boolean;
  disabled: boolean;
  onValueChange: (value: string) => void;
}

function ModelSelector({
  value,
  models,
  isLoading,
  isError,
  canFetch,
  requiresApiKey,
  disabled,
  onValueChange,
}: ModelSelectorProps) {
  const { t } = useTranslation('settings');
  const [open, setOpen] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState('');

  const filteredModels = useMemo(() => {
    if (!models.length || !searchInput.trim()) return models;
    const search = searchInput.toLowerCase();
    return models.filter(
      (m) => m.id.toLowerCase().includes(search) || m.name?.toLowerCase().includes(search)
    );
  }, [models, searchInput]);

  const selectedModel = models.find((m) => m.id === value);
  const displayValue = open ? searchInput : (selectedModel?.name ?? value);

  function getEmptyMessage() {
    if (isLoading) return t('form.modelsLoading');
    if (isError) return t('form.modelsError');
    if (!canFetch) {
      return requiresApiKey ? t('form.needsApiKey') : t('form.needsApiKeyAndBaseUrl');
    }
    if (searchInput.trim()) return t('form.pressEnterToUse', { model: searchInput.trim() });
    return t('form.noModels');
  }

  return (
    <Combobox
      value={value}
      onValueChange={(v) => {
        onValueChange(v ?? '');
        setSearchInput('');
      }}
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (isOpen) {
          setSearchInput('');
        }
      }}
      disabled={disabled || isLoading}
    >
      <ComboboxInput
        id="model"
        placeholder={t('form.modelPlaceholder')}
        value={displayValue}
        onChange={(e) => setSearchInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && searchInput.trim()) {
            e.preventDefault();
            onValueChange(searchInput.trim());
            setSearchInput('');
            setOpen(false);
          }
        }}
        disabled={disabled || isLoading}
        showTrigger
      />
      <ComboboxContent>
        <ComboboxList>
          {filteredModels.map((m) => (
            <ComboboxItem key={m.id} value={m.id}>
              {m.name ?? m.id}
            </ComboboxItem>
          ))}
        </ComboboxList>
        {filteredModels.length === 0 && (
          <div className="py-2 text-center text-sm text-muted-foreground">{getEmptyMessage()}</div>
        )}
      </ComboboxContent>
    </Combobox>
  );
}
