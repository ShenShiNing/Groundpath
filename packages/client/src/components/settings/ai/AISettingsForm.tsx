import React, { useEffect, useMemo } from 'react';
import { useForm } from '@tanstack/react-form';
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
  const [clearDialogOpen, setClearDialogOpen] = React.useState(false);
  const { data: config, isLoading, isError } = useLLMConfig();
  const { data: providers = [] } = useLLMProviders();
  const updateMutation = useUpdateLLMConfig();
  const deleteMutation = useDeleteLLMConfig();
  const testMutation = useTestLLMConnection();

  // Zustand store
  const store = useAISettingsStore();

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
      temperature: config?.temperature ?? 0.7,
      maxTokens: config?.maxTokens ?? 2048,
      topP: config?.topP ?? 1.0,
    },
  });

  const values = form.state.values;

  // 当前 provider 信息
  const currentProvider = useMemo(
    () => providers.find((p) => p.provider === values.provider),
    [providers, values.provider]
  );

  // 是否可以获取模型
  const canFetch = canFetchModels(
    values.provider,
    !!(config?.hasApiKey && config.provider === values.provider),
    store.pendingApiKey,
    values.baseUrl,
    store.pendingBaseUrl
  );

  // 获取模型列表
  const {
    data: modelsData,
    isLoading: modelsLoading,
    isError: modelsError,
    refetch: refetchModels,
  } = useLLMModels(values.provider, {
    apiKey: store.pendingApiKey ?? undefined,
    baseUrl: values.provider === 'custom' ? (store.pendingBaseUrl ?? values.baseUrl) : undefined,
    enabled: canFetch,
  });

  const models = modelsData?.models ?? [];
  const effectiveModel = values.model || models[0]?.id || '';

  // Loading 状态
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
        加载配置失败，请刷新页面重试
      </div>
    );
  }

  const isSaving = updateMutation.isPending;
  const isClearing = deleteMutation.isPending;
  const isBusy = isSaving || isClearing;
  const showApiKeyField = !!currentProvider?.requiresApiKey;
  const showBaseUrlField = !!currentProvider?.requiresBaseUrl;
  const hasSavedKey = !!(config?.hasApiKey && config.provider === values.provider);

  function resetFormAfterClear() {
    form.setFieldValue('provider', 'openai');
    form.setFieldValue('model', '');
    form.setFieldValue('apiKey', '');
    form.setFieldValue('baseUrl', '');
    form.setFieldValue('temperature', 0.7);
    form.setFieldValue('maxTokens', 2048);
    form.setFieldValue('topP', 1.0);
    store.resetPendingCredentials();
    store.resetTestStatus();
  }

  // Provider 切换
  function handleProviderChange(newProvider: LLMProviderType) {
    form.setFieldValue('provider', newProvider);
    form.setFieldValue('model', '');
    form.setFieldValue('apiKey', '');
    if (newProvider !== 'custom') {
      form.setFieldValue('baseUrl', '');
    }
    store.resetPendingCredentials();
    store.resetTestStatus();
  }

  // 测试连接
  function handleTest() {
    const normalizeTestMessage = (message: string) => {
      if (message === 'Provider health check failed') {
        return '连接失败，请检查 API Key、模型与 Base URL 配置';
      }
      return message;
    };

    testMutation.mutate(
      {
        ...(effectiveModel && { model: effectiveModel }),
        ...(values.provider !== config?.provider && { provider: values.provider }),
        ...(values.apiKey && { apiKey: values.apiKey }),
        ...(values.baseUrl && { baseUrl: values.baseUrl }),
      },
      {
        onSuccess: (result) => {
          if (result.success) {
            toast.success(
              result.latencyMs !== undefined ? `连接成功 (${result.latencyMs}ms)` : '连接成功'
            );
          } else {
            toast.error(normalizeTestMessage(result.message));
          }
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : '连接测试失败';
          toast.error(normalizeTestMessage(message));
        },
      }
    );
  }

  // 保存设置
  function handleSave() {
    updateMutation.mutate(
      {
        provider: values.provider,
        model: effectiveModel,
        baseUrl: values.baseUrl || null,
        temperature: values.temperature,
        maxTokens: values.maxTokens,
        topP: values.topP,
        ...(values.apiKey && { apiKey: values.apiKey }),
      },
      {
        onSuccess: () => {
          form.setFieldValue('apiKey', '');
          store.resetPendingCredentials();
        },
      }
    );
  }

  // 刷新模型列表
  function handleRefreshModels() {
    if (canFetch) {
      refetchModels();
    } else if (currentProvider?.requiresApiKey && currentProvider?.requiresBaseUrl) {
      toast.error('请先填写 API Key 和 Base URL');
    } else if (currentProvider?.requiresApiKey) {
      toast.error('请先填写 API Key');
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
      {/* Provider 选择 */}
      <form.Field name="provider">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="provider">服务商</Label>
            <Select
              value={field.state.value}
              onValueChange={(v) => handleProviderChange(v as LLMProviderType)}
              disabled={isBusy}
            >
              <SelectTrigger id="provider">
                <SelectValue placeholder="选择服务商" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.provider} value={p.provider}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">选择 AI 聊天服务商</p>
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
                    (当前: {config.apiKeyMasked})
                  </span>
                )}
              </Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={store.showApiKey ? 'text' : 'password'}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={() => {
                    field.handleBlur();
                    if (field.state.value.trim()) {
                      store.setPendingApiKey(field.state.value.trim());
                    }
                  }}
                  placeholder={hasSavedKey ? '输入新 Key 以更新' : '输入 API Key'}
                  disabled={isBusy}
                  className="pr-10"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={store.toggleShowApiKey}
                  disabled={isBusy}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {store.showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {values.provider === 'custom'
                  ? '填写 API Key 和 Base URL 后可获取模型列表'
                  : '输入 API Key 后自动获取可用模型'}
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
              <Label htmlFor="baseUrl">Base URL</Label>
              <Input
                id="baseUrl"
                type="url"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={() => {
                  field.handleBlur();
                  if (field.state.value.trim()) {
                    store.setPendingBaseUrl(field.state.value.trim());
                  }
                }}
                placeholder="https://api.example.com"
                disabled={isBusy}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">OpenAI 兼容的 API 端点地址</p>
            </div>
          )}
        </form.Field>
      )}

      {/* 模型选择 */}
      <form.Field name="model">
        {(field) => {
          const effectiveModelValue = field.state.value || models[0]?.id || '';
          return (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="model">模型</Label>
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
                  刷新
                </Button>
              </div>
              <ModelSelector
                value={effectiveModelValue}
                models={models}
                isLoading={modelsLoading}
                isError={modelsError}
                canFetch={canFetch}
                requiresApiKey={!!currentProvider?.requiresApiKey}
                disabled={isBusy}
                onValueChange={(v) => field.handleChange(v)}
              />
              <p className="text-xs text-muted-foreground">从列表选择或输入自定义模型名称</p>
            </div>
          );
        }}
      </form.Field>

      {/* 高级设置 */}
      <div className="space-y-4 rounded-lg border p-4">
        <h4 className="font-medium">高级设置</h4>
        <div className="grid gap-4 sm:grid-cols-3">
          <form.Field name="temperature">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="temperature">Temperature</Label>
                <Input
                  id="temperature"
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(parseFloat(e.target.value) || 0)}
                  disabled={isBusy}
                />
                <p className="text-xs text-muted-foreground">0 = 确定性, 2 = 创造性</p>
              </div>
            )}
          </form.Field>

          <form.Field name="maxTokens">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="maxTokens">Max Tokens</Label>
                <Input
                  id="maxTokens"
                  type="number"
                  min={1}
                  max={128000}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(parseInt(e.target.value) || 2048)}
                  disabled={isBusy}
                />
                <p className="text-xs text-muted-foreground">最大响应长度</p>
              </div>
            )}
          </form.Field>

          <form.Field name="topP">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="topP">Top P</Label>
                <Input
                  id="topP"
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(parseFloat(e.target.value) || 1)}
                  disabled={isBusy}
                />
                <p className="text-xs text-muted-foreground">核采样参数</p>
              </div>
            )}
          </form.Field>
        </div>
      </div>

      {/* 操作区 */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={
              isBusy ||
              testMutation.isPending ||
              !effectiveModel ||
              (showApiKeyField && !hasSavedKey && !values.apiKey) ||
              (showBaseUrlField && !values.baseUrl)
            }
          >
            {testMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Zap className="mr-2 h-4 w-4" />
            )}
            测试连接
          </Button>

          <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" disabled={!config || isBusy}>
                <Trash2 className="mr-2 h-4 w-4" />
                清空配置
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>确认清空 AI 配置？</AlertDialogTitle>
                <AlertDialogDescription>
                  此操作将删除当前模型、密钥与参数配置，且不可撤销。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isClearing}>取消</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={isClearing}
                  onClick={handleClearConfig}
                >
                  {isClearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  确认清空
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button type="button" onClick={handleSave} disabled={isBusy || !effectiveModel}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            保存设置
          </Button>
        </div>
      </div>
    </div>
  );
}

// 模型选择器（内联组件）
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
  const [open, setOpen] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState('');

  const filteredModels = useMemo(() => {
    if (!models.length || !searchInput.trim()) return models;
    const search = searchInput.toLowerCase();
    return models.filter(
      (m) => m.id.toLowerCase().includes(search) || m.name?.toLowerCase().includes(search)
    );
  }, [models, searchInput]);

  // 找到选中模型的显示名称
  const selectedModel = models.find((m) => m.id === value);
  // 下拉框打开时显示搜索内容，关闭时显示选中值
  const displayValue = open ? searchInput : (selectedModel?.name ?? value);

  function getEmptyMessage() {
    if (isLoading) return '加载模型中...';
    if (isError) return '加载失败，请刷新重试';
    if (!canFetch) {
      return requiresApiKey ? '请先输入 API Key' : '请先输入 API Key 和 Base URL';
    }
    if (searchInput.trim()) return `按 Enter 使用 "${searchInput.trim()}"`;
    return '无可用模型';
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
          setSearchInput(''); // 打开时清空搜索框以显示所有选项
        }
      }}
      disabled={disabled || isLoading}
    >
      <ComboboxInput
        id="model"
        placeholder="选择或输入模型..."
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
