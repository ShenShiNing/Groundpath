import React, { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FetchModelsResponse,
  LLMConfigInfo,
  LLMProviderInfo,
  TestLLMConnectionResponse,
} from '@knowledge-agent/shared/types';
import type { UpdateLLMConfigInput } from '@knowledge-agent/shared/schemas';
import {
  useDeleteLLMConfig,
  useLLMConfig,
  useLLMModels,
  useLLMProviders,
  useTestLLMConnection,
  useUpdateLLMConfig,
} from '@/hooks/useLLMConfig';
import { queryKeys } from '@/lib/query';
import { flushPromises, render } from '../utils/render';

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getProviders: vi.fn(),
  fetchModels: vi.fn(),
  updateConfig: vi.fn(),
  deleteConfig: vi.fn(),
  testConnection: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    llmConfigApi: {
      ...actual.llmConfigApi,
      getConfig: mocks.getConfig,
      getProviders: mocks.getProviders,
      fetchModels: mocks.fetchModels,
      updateConfig: mocks.updateConfig,
      deleteConfig: mocks.deleteConfig,
      testConnection: mocks.testConnection,
    },
  };
});

const configFixture: LLMConfigInfo = {
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
};

const providersFixture: LLMProviderInfo[] = [
  {
    provider: 'openai',
    name: 'OpenAI',
    requiresApiKey: true,
    requiresBaseUrl: false,
  },
];

const modelsFixture: FetchModelsResponse = {
  models: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4.1' }],
  fromCache: false,
};

const testConnectionFixture: TestLLMConnectionResponse = {
  success: true,
  message: 'ok',
  latencyMs: 120,
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

async function waitFor(condition: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await flushPromises();
    if (condition()) {
      return;
    }
  }

  throw new Error('Condition was not met');
}

async function renderWithClient(client: QueryClient, ui: React.ReactElement) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function getQueryOptions(queryClient: QueryClient, queryKey: readonly unknown[]) {
  return queryClient.getQueryCache().find({ queryKey })?.options as
    | {
        staleTime?: number;
        refetchOnWindowFocus?: boolean;
      }
    | undefined;
}

describe('useLLMConfig hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockResolvedValue(configFixture);
    mocks.getProviders.mockResolvedValue(providersFixture);
    mocks.fetchModels.mockResolvedValue(modelsFixture);
    mocks.updateConfig.mockResolvedValue(configFixture);
    mocks.deleteConfig.mockResolvedValue(undefined);
    mocks.testConnection.mockResolvedValue(testConnectionFixture);
  });

  it('should fetch config/providers and apply model query caching options', async () => {
    const queryClient = createQueryClient();

    function QueryProbe() {
      useLLMConfig();
      useLLMProviders();
      useLLMModels('openai', { apiKey: 'secret', baseUrl: null });
      return null;
    }

    const view = await renderWithClient(queryClient, <QueryProbe />);

    await waitFor(
      () =>
        queryClient.getQueryData(queryKeys.llm.config) !== undefined &&
        queryClient.getQueryData(queryKeys.llm.providers) !== undefined &&
        queryClient.getQueryData(queryKeys.llm.models('openai', true, null)) !== undefined
    );

    const modelOptions = getQueryOptions(queryClient, queryKeys.llm.models('openai', true, null));

    expect(queryClient.getQueryData(queryKeys.llm.config)).toBe(configFixture);
    expect(queryClient.getQueryData(queryKeys.llm.providers)).toEqual(providersFixture);
    expect(queryClient.getQueryData(queryKeys.llm.models('openai', true, null))).toEqual(
      modelsFixture
    );
    expect(modelOptions?.staleTime).toBe(300_000);
    expect(modelOptions?.refetchOnWindowFocus).toBe(false);

    await view.unmount();
  });

  it('should invalidate config and model caches and show success toasts after update/delete', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const mutationRef: {
      current?: {
        updateConfig: ReturnType<typeof useUpdateLLMConfig>;
        deleteConfig: ReturnType<typeof useDeleteLLMConfig>;
      };
    } = {};

    function MutationProbe({
      onReady,
    }: {
      onReady: (mutation: NonNullable<typeof mutationRef.current>) => void;
    }) {
      const updateConfig = useUpdateLLMConfig();
      const deleteConfig = useDeleteLLMConfig();

      React.useEffect(() => {
        onReady({ updateConfig, deleteConfig });
      }, [deleteConfig, onReady, updateConfig]);

      return null;
    }

    const view = await renderWithClient(
      queryClient,
      <MutationProbe
        onReady={(mutation) => {
          mutationRef.current = mutation;
        }}
      />
    );

    await waitFor(() => mutationRef.current !== undefined);

    await act(async () => {
      await mutationRef.current?.updateConfig.mutateAsync({
        provider: 'openai',
        model: 'gpt-4.1',
        baseUrl: null,
      } satisfies UpdateLLMConfigInput);
      await mutationRef.current?.deleteConfig.mutateAsync();
    });

    expect(invalidateSpy.mock.calls.map(([query]) => query)).toEqual([
      { queryKey: queryKeys.llm.config },
      { queryKey: ['llm', 'models'] },
      { queryKey: queryKeys.llm.config },
      { queryKey: ['llm', 'models'] },
    ]);
    expect(mocks.toastSuccess).toHaveBeenNthCalledWith(1, 'toast.saved');
    expect(mocks.toastSuccess).toHaveBeenNthCalledWith(2, 'toast.cleared');

    await view.unmount();
  });

  it('should surface translated fallback errors and expose test connection mutation', async () => {
    const queryClient = createQueryClient();
    const fallbackError = { code: 'boom' };
    const mutationRef: {
      current?: {
        updateConfig: ReturnType<typeof useUpdateLLMConfig>;
        deleteConfig: ReturnType<typeof useDeleteLLMConfig>;
        testConnection: ReturnType<typeof useTestLLMConnection>;
      };
    } = {};

    mocks.updateConfig.mockRejectedValue(fallbackError);
    mocks.deleteConfig.mockRejectedValue(fallbackError);

    function MutationProbe({
      onReady,
    }: {
      onReady: (mutation: NonNullable<typeof mutationRef.current>) => void;
    }) {
      const updateConfig = useUpdateLLMConfig();
      const deleteConfig = useDeleteLLMConfig();
      const testConnection = useTestLLMConnection();

      React.useEffect(() => {
        onReady({ updateConfig, deleteConfig, testConnection });
      }, [deleteConfig, onReady, testConnection, updateConfig]);

      return null;
    }

    const view = await renderWithClient(
      queryClient,
      <MutationProbe
        onReady={(mutation) => {
          mutationRef.current = mutation;
        }}
      />
    );

    await waitFor(() => mutationRef.current !== undefined);

    await expect(
      mutationRef.current?.updateConfig.mutateAsync({
        provider: 'openai',
        model: 'gpt-4.1',
        baseUrl: null,
      } satisfies UpdateLLMConfigInput) ?? Promise.resolve()
    ).rejects.toBe(fallbackError);

    await expect(mutationRef.current?.deleteConfig.mutateAsync() ?? Promise.resolve()).rejects.toBe(
      fallbackError
    );

    await act(async () => {
      const result = await mutationRef.current?.testConnection.mutateAsync({
        provider: 'openai',
        model: 'gpt-4.1',
      });
      expect(result).toEqual(testConnectionFixture);
    });

    expect(mocks.toastError).toHaveBeenNthCalledWith(1, 'toast.saveFailed');
    expect(mocks.toastError).toHaveBeenNthCalledWith(2, 'toast.clearFailed');

    await view.unmount();
  });
});
