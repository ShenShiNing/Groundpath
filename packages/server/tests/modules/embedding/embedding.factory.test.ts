import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmbeddingProviderType } from '@modules/embedding/embedding.types';

const { zhipuCtorMock, openaiCtorMock, ollamaCtorMock, loggerInfoMock } = vi.hoisted(() => ({
  zhipuCtorMock: vi.fn(
    class MockZhipuProvider {
      provider = 'zhipu';
    }
  ),
  openaiCtorMock: vi.fn(
    class MockOpenAIProvider {
      provider = 'openai';
    }
  ),
  ollamaCtorMock: vi.fn(
    class MockOllamaProvider {
      provider = 'ollama';
    }
  ),
  loggerInfoMock: vi.fn(),
}));

vi.mock('@modules/embedding/providers/zhipu.provider', () => ({
  ZhipuProvider: zhipuCtorMock,
}));

vi.mock('@modules/embedding/providers/openai.provider', () => ({
  OpenAIProvider: openaiCtorMock,
}));

vi.mock('@modules/embedding/providers/ollama.provider', () => ({
  OllamaProvider: ollamaCtorMock,
}));

vi.mock('@config/env', () => ({
  embeddingConfig: {
    provider: 'zhipu',
  },
}));

vi.mock('@shared/logger', () => ({
  createLogger: vi.fn(() => ({
    info: loggerInfoMock,
  })),
}));

import {
  getEmbeddingProvider,
  getEmbeddingProviderByType,
  resetEmbeddingProvider,
} from '@modules/embedding/embedding.factory';

describe('embedding.factory', () => {
  beforeEach(() => {
    resetEmbeddingProvider();
    vi.clearAllMocks();
  });

  it('should create and cache provider by type', () => {
    const provider1 = getEmbeddingProviderByType('openai');
    const provider2 = getEmbeddingProviderByType('openai');

    expect(provider1).toBe(provider2);
    expect(openaiCtorMock).toHaveBeenCalledTimes(1);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      { provider: 'openai' },
      'Creating embedding provider'
    );
  });

  it('should return default provider from env config', () => {
    const provider = getEmbeddingProvider();

    expect(provider).toMatchObject({ provider: 'zhipu' });
    expect(zhipuCtorMock).toHaveBeenCalledTimes(1);
  });

  it('should create different instances for different provider types', () => {
    const zhipu = getEmbeddingProviderByType('zhipu');
    const ollama = getEmbeddingProviderByType('ollama');

    expect(zhipu).not.toBe(ollama);
    expect(zhipuCtorMock).toHaveBeenCalledTimes(1);
    expect(ollamaCtorMock).toHaveBeenCalledTimes(1);
  });

  it('should recreate provider after reset', () => {
    const first = getEmbeddingProviderByType('openai');
    resetEmbeddingProvider();
    const second = getEmbeddingProviderByType('openai');

    expect(first).not.toBe(second);
    expect(openaiCtorMock).toHaveBeenCalledTimes(2);
  });

  it('should throw on unknown provider type', () => {
    expect(() => getEmbeddingProviderByType('invalid' as unknown as EmbeddingProviderType)).toThrow(
      'Unknown embedding provider: invalid'
    );
  });
});
