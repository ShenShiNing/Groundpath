import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireClick, fireInput, flushPromises, render } from '../../utils/render';
import type { AISettingsConfig } from '../../../src/components/settings/ai/types';
import type { LLMProviderInfo } from '@knowledge-agent/shared/types';

const mocks = vi.hoisted(() => ({
  canFetchModels: vi.fn(),
  updateMutate: vi.fn(),
  deleteMutate: vi.fn(),
  testMutate: vi.fn(),
  refetchModels: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

const storeState = {
  showApiKey: false,
  pendingApiKey: null as string | null,
  pendingBaseUrl: null as string | null,
  toggleShowApiKey: vi.fn(() => {
    storeState.showApiKey = !storeState.showApiKey;
  }),
  setPendingApiKey: vi.fn((value: string | null) => {
    storeState.pendingApiKey = value;
  }),
  setPendingBaseUrl: vi.fn((value: string | null) => {
    storeState.pendingBaseUrl = value;
  }),
  resetPendingCredentials: vi.fn(() => {
    storeState.pendingApiKey = null;
    storeState.pendingBaseUrl = null;
  }),
  reset: vi.fn(() => {
    storeState.showApiKey = false;
    storeState.pendingApiKey = null;
    storeState.pendingBaseUrl = null;
  }),
};

const providersFixture: LLMProviderInfo[] = [
  {
    provider: 'openai',
    name: 'OpenAI',
    requiresApiKey: true,
    requiresBaseUrl: false,
  },
  {
    provider: 'custom',
    name: 'Custom',
    requiresApiKey: true,
    requiresBaseUrl: true,
  },
  {
    provider: 'ollama',
    name: 'Ollama',
    requiresApiKey: false,
    requiresBaseUrl: false,
    optionalBaseUrl: true,
    defaultBaseUrl: 'http://localhost:11434',
  },
];

const queryState = {
  config: {
    data: null as AISettingsConfig,
    isLoading: false,
    isError: false,
  },
  providers: {
    data: providersFixture,
  },
  models: {
    data: { models: [{ id: 'gpt-4o-mini' }, { id: 'custom-model' }] },
    isLoading: false,
    isError: false,
  },
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/stores', () => ({
  useAISettingsStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
  canFetchModels: mocks.canFetchModels,
}));

vi.mock('@/hooks', () => ({
  useLLMConfig: () => queryState.config,
  useLLMProviders: () => queryState.providers,
  useLLMModels: () => ({
    ...queryState.models,
    refetch: mocks.refetchModels,
  }),
  useUpdateLLMConfig: () => ({
    mutate: mocks.updateMutate,
    isPending: false,
  }),
  useDeleteLLMConfig: () => ({
    mutate: mocks.deleteMutate,
    isPending: false,
  }),
  useTestLLMConnection: () => ({
    mutate: mocks.testMutate,
    isPending: false,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock('@/components/settings/ai/sections/AISettingsCredentialsSection', () => ({
  AISettingsCredentialsSection: ({
    values,
    showBaseUrlField,
    showApiKeyField,
    onProviderChange,
    onApiKeyChange,
    onBaseUrlChange,
  }: {
    values: { provider: string; apiKey: string; baseUrl: string };
    showBaseUrlField: boolean;
    showApiKeyField: boolean;
    onProviderChange: (provider: 'openai' | 'custom' | 'ollama') => void;
    onApiKeyChange: (value: string) => void;
    onBaseUrlChange: (value: string) => void;
  }) => (
    <div>
      <div data-testid="provider-value">{values.provider}</div>
      <button type="button" onClick={() => onProviderChange('openai')}>
        provider-openai
      </button>
      <button type="button" onClick={() => onProviderChange('custom')}>
        provider-custom
      </button>
      <button type="button" onClick={() => onProviderChange('ollama')}>
        provider-ollama
      </button>
      <div data-testid="show-api-key">{showApiKeyField ? 'yes' : 'no'}</div>
      <div data-testid="show-base-url">{showBaseUrlField ? 'yes' : 'no'}</div>
      <input
        id="apiKey"
        value={values.apiKey}
        onChange={(event) => onApiKeyChange(event.target.value)}
      />
      <input
        id="baseUrl"
        value={values.baseUrl}
        onChange={(event) => onBaseUrlChange(event.target.value)}
      />
    </div>
  ),
}));

vi.mock('@/components/settings/ai/sections/AISettingsModelSection', () => ({
  AISettingsModelSection: ({
    model,
    onModelChange,
    onRefresh,
  }: {
    model: string;
    onModelChange: (value: string) => void;
    onRefresh: () => void;
  }) => (
    <div>
      <input id="model" value={model} onChange={(event) => onModelChange(event.target.value)} />
      <button type="button" onClick={onRefresh}>
        refresh-models
      </button>
    </div>
  ),
}));

vi.mock('@/components/settings/ai/sections/AISettingsActions', () => ({
  AISettingsActions: ({
    canSave,
    canTest,
    clearDialogOpen,
    onSave,
    onTest,
    onClearDialogOpenChange,
    onClearConfig,
  }: {
    canSave: boolean;
    canTest: boolean;
    clearDialogOpen: boolean;
    onSave: () => void;
    onTest: () => void;
    onClearDialogOpenChange: (open: boolean) => void;
    onClearConfig: () => void;
  }) => (
    <div>
      <button type="button" disabled={!canSave} onClick={onSave}>
        save-settings
      </button>
      <button type="button" disabled={!canTest} onClick={onTest}>
        test-connection
      </button>
      <button type="button" onClick={() => onClearDialogOpenChange(true)}>
        open-clear
      </button>
      {clearDialogOpen ? (
        <button type="button" onClick={onClearConfig}>
          confirm-clear
        </button>
      ) : null}
    </div>
  ),
}));

import { AISettingsForm } from '../../../src/components/settings/ai/AISettingsForm';

function setConfig(config: AISettingsConfig) {
  queryState.config = {
    data: config,
    isLoading: false,
    isError: false,
  };
}

describe('AISettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.showApiKey = false;
    storeState.pendingApiKey = null;
    storeState.pendingBaseUrl = null;
    queryState.providers = { data: providersFixture };
    queryState.models = {
      data: { models: [{ id: 'gpt-4o-mini' }, { id: 'custom-model' }] },
      isLoading: false,
      isError: false,
    };
    mocks.canFetchModels.mockReturnValue(true);
    setConfig({
      id: 'cfg-1',
      userId: 'user-1',
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKeyMasked: '****1234',
      hasApiKey: true,
      baseUrl: null,
      temperature: 0.7,
      maxTokens: 2048,
      topP: 1,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-02T00:00:00.000Z'),
    });
  });

  it('should switch provider and clear base url when leaving custom provider', async () => {
    setConfig({
      id: 'cfg-custom',
      userId: 'user-1',
      provider: 'custom',
      model: 'custom-model',
      apiKeyMasked: '****9876',
      hasApiKey: true,
      baseUrl: 'https://custom.example.com',
      temperature: 0.7,
      maxTokens: 2048,
      topP: 1,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-02T00:00:00.000Z'),
    });

    const view = await render(<AISettingsForm />);

    expect(view.container.querySelector('[data-testid="provider-value"]')?.textContent).toBe(
      'custom'
    );
    const baseUrlInput = view.container.querySelector('#baseUrl') as HTMLInputElement | null;
    expect(baseUrlInput?.value).toBe('https://custom.example.com');

    const providerOpenAIButton = Array.from(view.container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('provider-openai')
    );
    await fireClick(providerOpenAIButton ?? null);

    expect(view.container.querySelector('[data-testid="provider-value"]')?.textContent).toBe(
      'openai'
    );
    expect((view.container.querySelector('#baseUrl') as HTMLInputElement | null)?.value).toBe('');
    expect(storeState.resetPendingCredentials).toHaveBeenCalled();

    await view.unmount();
  });

  it('should show api key required toast when refreshing models without credentials', async () => {
    setConfig({
      id: 'cfg-openai',
      userId: 'user-1',
      provider: 'openai',
      model: '',
      apiKeyMasked: null,
      hasApiKey: false,
      baseUrl: null,
      temperature: 0.7,
      maxTokens: 2048,
      topP: 1,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-02T00:00:00.000Z'),
    });
    mocks.canFetchModels.mockReturnValue(false);

    const view = await render(<AISettingsForm />);

    const refreshButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('refresh-models')
    );
    await fireClick(refreshButton ?? null);

    expect(mocks.toastError).toHaveBeenCalledWith('form.apiKeyRequired');
    expect(mocks.refetchModels).not.toHaveBeenCalled();

    await view.unmount();
  });

  it('should test connection and show success toast', async () => {
    mocks.testMutate.mockImplementation((_payload, options) => {
      options?.onSuccess?.({ success: true, message: 'ok', latencyMs: 321 });
    });

    const view = await render(<AISettingsForm />);

    const testButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('test-connection')
    );
    await fireClick(testButton ?? null);

    expect(mocks.testMutate).toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith('form.testSuccessLatency');

    await view.unmount();
  });

  it('should save config and clear pending credentials after success', async () => {
    mocks.updateMutate.mockImplementation((_payload, options) => {
      options?.onSuccess?.();
    });

    const view = await render(<AISettingsForm />);

    const modelInput = view.container.querySelector('#model') as HTMLInputElement | null;
    const apiKeyInput = view.container.querySelector('#apiKey') as HTMLInputElement | null;

    await fireInput(modelInput, 'gpt-4.1');
    await fireInput(apiKeyInput, 'new-secret');

    const saveButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('save-settings')
    );
    await fireClick(saveButton ?? null);

    expect(mocks.updateMutate).toHaveBeenCalledWith(
      {
        provider: 'openai',
        model: 'gpt-4.1',
        baseUrl: null,
        apiKey: 'new-secret',
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
      })
    );
    expect(storeState.resetPendingCredentials).toHaveBeenCalled();
    expect((view.container.querySelector('#apiKey') as HTMLInputElement | null)?.value).toBe('');

    await view.unmount();
  });

  it('should clear config and reset form to defaults after success', async () => {
    setConfig({
      id: 'cfg-custom',
      userId: 'user-1',
      provider: 'custom',
      model: 'custom-model',
      apiKeyMasked: '****9876',
      hasApiKey: true,
      baseUrl: 'https://custom.example.com',
      temperature: 0.7,
      maxTokens: 2048,
      topP: 1,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-02T00:00:00.000Z'),
    });
    mocks.deleteMutate.mockImplementation((_payload, options) => {
      options?.onSuccess?.();
    });

    const view = await render(<AISettingsForm />);

    const openClearButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('open-clear')
    );
    await fireClick(openClearButton ?? null);

    const confirmClearButton = Array.from(view.container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('confirm-clear')
    );
    await fireClick(confirmClearButton ?? null);
    await flushPromises();

    expect(mocks.deleteMutate).toHaveBeenCalled();
    expect(view.container.querySelector('[data-testid="provider-value"]')?.textContent).toBe(
      'openai'
    );
    expect(storeState.resetPendingCredentials).toHaveBeenCalled();

    await view.unmount();
  });
});
