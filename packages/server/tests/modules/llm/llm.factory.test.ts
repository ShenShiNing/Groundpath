import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  openAIProviderMock,
  anthropicProviderMock,
  zhipuProviderMock,
  deepSeekProviderMock,
  ollamaProviderMock,
  customProviderMock,
} = vi.hoisted(() => ({
  openAIProviderMock: vi.fn(),
  anthropicProviderMock: vi.fn(),
  zhipuProviderMock: vi.fn(),
  deepSeekProviderMock: vi.fn(),
  ollamaProviderMock: vi.fn(),
  customProviderMock: vi.fn(),
}));

vi.mock('@modules/llm/providers/openai.provider', () => ({
  OpenAIProvider: openAIProviderMock,
}));
vi.mock('@modules/llm/providers/anthropic.provider', () => ({
  AnthropicProvider: anthropicProviderMock,
}));
vi.mock('@modules/llm/providers/zhipu.provider', () => ({
  ZhipuProvider: zhipuProviderMock,
}));
vi.mock('@modules/llm/providers/deepseek.provider', () => ({
  DeepSeekProvider: deepSeekProviderMock,
}));
vi.mock('@modules/llm/providers/ollama.provider', () => ({
  OllamaProvider: ollamaProviderMock,
}));
vi.mock('@modules/llm/providers/custom.provider', () => ({
  CustomProvider: customProviderMock,
}));

import { createLLMProvider } from '@modules/llm/llm.factory';

describe('llm.factory > createLLMProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openAIProviderMock.mockImplementation(function (apiKey: string, model: string) {
      return { provider: 'openai', apiKey, model };
    });
    anthropicProviderMock.mockImplementation(function (apiKey: string, model: string) {
      return { provider: 'anthropic', apiKey, model };
    });
    zhipuProviderMock.mockImplementation(function (apiKey: string, model: string) {
      return { provider: 'zhipu', apiKey, model };
    });
    deepSeekProviderMock.mockImplementation(function (apiKey: string, model: string) {
      return { provider: 'deepseek', apiKey, model };
    });
    ollamaProviderMock.mockImplementation(function (model: string, baseUrl: string) {
      return { provider: 'ollama', model, baseUrl };
    });
    customProviderMock.mockImplementation(function (
      apiKey: string,
      model: string,
      baseUrl: string
    ) {
      return { provider: 'custom', apiKey, model, baseUrl };
    });
  });

  it('should create openai provider with explicit api key', () => {
    const provider = createLLMProvider('openai', { apiKey: 'direct-key', model: 'gpt-4o' });

    expect(openAIProviderMock).toHaveBeenCalledWith('direct-key', 'gpt-4o');
    expect(provider).toEqual({ provider: 'openai', apiKey: 'direct-key', model: 'gpt-4o' });
  });

  it('should require explicit api keys for hosted providers', () => {
    expect(() => createLLMProvider('openai', { model: 'gpt-4o-mini' })).toThrow(
      'OpenAI API key is required'
    );
    expect(() => createLLMProvider('anthropic', { model: 'claude-sonnet' })).toThrow(
      'Anthropic API key is required'
    );
    expect(() => createLLMProvider('zhipu', { model: 'glm-4' })).toThrow(
      'Zhipu API key is required'
    );
    expect(() => createLLMProvider('deepseek', { model: 'deepseek-chat' })).toThrow(
      'DeepSeek API key is required'
    );
  });

  it('should create anthropic provider with explicit api key', () => {
    const provider = createLLMProvider('anthropic', {
      apiKey: 'anthropic-key',
      model: 'claude-sonnet',
    });

    expect(anthropicProviderMock).toHaveBeenCalledWith('anthropic-key', 'claude-sonnet');
    expect(provider).toEqual({
      provider: 'anthropic',
      apiKey: 'anthropic-key',
      model: 'claude-sonnet',
    });
  });

  it('should create deepseek and zhipu providers with explicit api keys', () => {
    const deepseek = createLLMProvider('deepseek', {
      apiKey: 'deepseek-key',
      model: 'deepseek-chat',
    });
    const zhipu = createLLMProvider('zhipu', { apiKey: 'zhipu-key', model: 'glm-4' });

    expect(deepSeekProviderMock).toHaveBeenCalledWith('deepseek-key', 'deepseek-chat');
    expect(zhipuProviderMock).toHaveBeenCalledWith('zhipu-key', 'glm-4');
    expect(deepseek).toEqual({
      provider: 'deepseek',
      apiKey: 'deepseek-key',
      model: 'deepseek-chat',
    });
    expect(zhipu).toEqual({ provider: 'zhipu', apiKey: 'zhipu-key', model: 'glm-4' });
  });

  it('should create ollama provider with default or overridden base url', () => {
    const fromEnv = createLLMProvider('ollama', { model: 'llama3.1' });
    const fromConfig = createLLMProvider('ollama', {
      model: 'llama3.1',
      baseUrl: 'http://127.0.0.1:11435',
    });

    expect(ollamaProviderMock).toHaveBeenNthCalledWith(1, 'llama3.1', 'http://localhost:11434');
    expect(ollamaProviderMock).toHaveBeenNthCalledWith(2, 'llama3.1', 'http://127.0.0.1:11435');
    expect(fromEnv).toEqual({
      provider: 'ollama',
      model: 'llama3.1',
      baseUrl: 'http://localhost:11434',
    });
    expect(fromConfig).toEqual({
      provider: 'ollama',
      model: 'llama3.1',
      baseUrl: 'http://127.0.0.1:11435',
    });
  });

  it('should validate custom provider config', () => {
    expect(() =>
      createLLMProvider('custom', { model: 'custom-model', baseUrl: 'https://api.custom.ai' })
    ).toThrow('API key is required for custom provider');
    expect(() =>
      createLLMProvider('custom', { model: 'custom-model', apiKey: 'secret-key' })
    ).toThrow('Base URL is required for custom provider');
  });

  it('should create custom provider when config is complete', () => {
    const provider = createLLMProvider('custom', {
      apiKey: 'secret-key',
      model: 'custom-model',
      baseUrl: 'https://api.custom.ai',
    });

    expect(customProviderMock).toHaveBeenCalledWith(
      'secret-key',
      'custom-model',
      'https://api.custom.ai'
    );
    expect(provider).toEqual({
      provider: 'custom',
      apiKey: 'secret-key',
      model: 'custom-model',
      baseUrl: 'https://api.custom.ai',
    });
  });

  it('should throw for unknown provider type', () => {
    const unknownType = 'unknown' as unknown as Parameters<typeof createLLMProvider>[0];
    expect(() => createLLMProvider(unknownType, { model: 'x' })).toThrow(
      'Unknown LLM provider: unknown'
    );
  });
});
