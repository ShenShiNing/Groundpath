import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openaiCtor: vi.fn(),
  anthropicCtor: vi.fn(),
  loggerInfo: vi.fn(),
  env: {
    vlmConfig: {
      provider: 'openai' as 'openai' | 'anthropic',
      model: 'gpt-4o-mini',
      apiKey: undefined as string | undefined,
      baseUrl: 'https://vlm.example.com',
    },
    llmConfig: {
      openaiApiKey: 'env-openai-key',
      anthropicApiKey: 'env-anthropic-key',
    },
  },
}));

vi.mock('@config/env', () => mocks.env);

vi.mock('@shared/logger', () => ({
  createLogger: () => ({
    info: mocks.loggerInfo,
  }),
}));

vi.mock('@modules/vlm/providers/openai-vlm.provider', () => ({
  OpenAIVLMProvider: mocks.openaiCtor,
}));

vi.mock('@modules/vlm/providers/anthropic-vlm.provider', () => ({
  AnthropicVLMProvider: mocks.anthropicCtor,
}));

import { getVLMProvider, resetVLMProvider } from '@modules/vlm/vlm.factory';

describe('vlm.factory', () => {
  beforeEach(() => {
    resetVLMProvider();
    vi.clearAllMocks();
    mocks.env.vlmConfig.provider = 'openai';
    mocks.env.vlmConfig.model = 'gpt-4o-mini';
    mocks.env.vlmConfig.apiKey = undefined;
    mocks.env.vlmConfig.baseUrl = 'https://vlm.example.com';
    mocks.env.llmConfig.openaiApiKey = 'env-openai-key';
    mocks.env.llmConfig.anthropicApiKey = 'env-anthropic-key';

    mocks.openaiCtor.mockImplementation(function (apiKey: string, model: string, baseUrl?: string) {
      return { provider: 'openai', apiKey, model, baseUrl };
    });
    mocks.anthropicCtor.mockImplementation(function (
      apiKey: string,
      model: string,
      baseUrl?: string
    ) {
      return { provider: 'anthropic', apiKey, model, baseUrl };
    });
  });

  it('should use explicit VLM api key before llm fallback', () => {
    mocks.env.vlmConfig.apiKey = 'vlm-direct-key';

    const provider = getVLMProvider();

    expect(mocks.openaiCtor).toHaveBeenCalledWith(
      'vlm-direct-key',
      'gpt-4o-mini',
      'https://vlm.example.com'
    );
    expect(provider).toEqual({
      provider: 'openai',
      apiKey: 'vlm-direct-key',
      model: 'gpt-4o-mini',
      baseUrl: 'https://vlm.example.com',
    });
  });

  it('should fallback to provider-specific llm key', () => {
    const provider = getVLMProvider();

    expect(mocks.openaiCtor).toHaveBeenCalledWith(
      'env-openai-key',
      'gpt-4o-mini',
      'https://vlm.example.com'
    );
    expect(provider).toMatchObject({
      provider: 'openai',
      apiKey: 'env-openai-key',
    });
  });

  it('should create anthropic provider when configured', () => {
    mocks.env.vlmConfig.provider = 'anthropic';
    mocks.env.vlmConfig.model = 'claude-3-7-sonnet';
    mocks.env.vlmConfig.baseUrl = 'https://anthropic.example.com';

    const provider = getVLMProvider();

    expect(mocks.anthropicCtor).toHaveBeenCalledWith(
      'env-anthropic-key',
      'claude-3-7-sonnet',
      'https://anthropic.example.com'
    );
    expect(provider).toMatchObject({
      provider: 'anthropic',
      apiKey: 'env-anthropic-key',
      model: 'claude-3-7-sonnet',
    });
  });

  it('should cache provider until reset', () => {
    const first = getVLMProvider();
    const second = getVLMProvider();

    expect(first).toBe(second);
    expect(mocks.openaiCtor).toHaveBeenCalledTimes(1);

    resetVLMProvider();
    const third = getVLMProvider();

    expect(third).not.toBe(first);
    expect(mocks.openaiCtor).toHaveBeenCalledTimes(2);
  });

  it('should throw validation error when no api key can be resolved', () => {
    mocks.env.vlmConfig.apiKey = undefined;
    mocks.env.llmConfig.openaiApiKey = undefined as unknown as string;

    expect(() => getVLMProvider()).toThrow('VLM API key not configured');
  });
});
