import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createLLMProvider: vi.fn(),
  llmConfigService: {
    getFullConfig: vi.fn(),
  },
}));

vi.mock('@modules/llm/llm.factory', () => ({
  createLLMProvider: mocks.createLLMProvider,
}));

vi.mock('@modules/llm/services/llm-config.service', () => ({
  llmConfigService: mocks.llmConfigService,
}));

vi.mock('@core/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { llmService } from '@modules/llm/services/llm.service';

describe('llmService.testConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success when provider healthCheck passes', async () => {
    const healthCheck = vi.fn().mockResolvedValue(true);
    mocks.llmConfigService.getFullConfig.mockResolvedValue(null);
    mocks.createLLMProvider.mockReturnValue({
      healthCheck,
    });

    const result = await llmService.testConnection('user-1', {
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test',
    });

    expect(mocks.createLLMProvider).toHaveBeenCalledWith('openai', {
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      baseUrl: undefined,
    });
    expect(healthCheck).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.message).toBe('Connection successful');
    expect(typeof result.latencyMs).toBe('number');
  });

  it('returns provider error message when healthCheck throws', async () => {
    mocks.llmConfigService.getFullConfig.mockResolvedValue(null);
    mocks.createLLMProvider.mockReturnValue({
      healthCheck: vi.fn().mockRejectedValue(new Error('OpenAI API error: 401')),
    });

    const result = await llmService.testConnection('user-1', {
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test',
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe('OpenAI API error: 401');
    expect(typeof result.latencyMs).toBe('number');
  });
});
