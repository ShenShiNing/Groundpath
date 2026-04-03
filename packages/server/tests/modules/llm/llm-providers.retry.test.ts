import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/env', () => ({
  externalServiceConfig: {
    llm: {
      timeoutMs: 30_000,
      maxRetries: 2,
      baseDelayMs: 100,
      maxDelayMs: 1_000,
    },
  },
}));

vi.mock('@core/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('LLM provider retry integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('retries DeepSeek generate on retryable 5xx and eventually succeeds', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

    const { DeepSeekProvider } = await import('@modules/llm/providers/deepseek.provider');
    const provider = new DeepSeekProvider('test-key', 'deepseek-chat');

    const promise = provider.generate([{ role: 'user', content: 'hello' }]);
    await vi.advanceTimersByTimeAsync(100);

    await expect(promise).resolves.toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry DeepSeek generate on non-retryable 401', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }));

    const { DeepSeekProvider } = await import('@modules/llm/providers/deepseek.provider');
    const provider = new DeepSeekProvider('test-key', 'deepseek-chat');

    await expect(provider.generate([{ role: 'user', content: 'hello' }])).rejects.toThrow(
      'DeepSeek API error: 401 Unauthorized'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
