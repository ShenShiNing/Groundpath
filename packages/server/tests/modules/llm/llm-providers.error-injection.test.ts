import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Mock logger ───
const { loggerMock } = vi.hoisted(() => ({
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@core/logger', () => ({
  createLogger: () => loggerMock,
  logger: loggerMock,
}));

// ─── Mock SDKs ───
const { openaiCreateMock, anthropicCreateMock } = vi.hoisted(() => ({
  openaiCreateMock: vi.fn(),
  anthropicCreateMock: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: openaiCreateMock,
      },
    };
  },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: anthropicCreateMock,
      stream: vi.fn(),
    };
  },
}));

// ─── DeepSeek Provider Tests ───
describe('DeepSeek LLM Error Injection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw on 5xx server error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' })
    );

    const { DeepSeekProvider } = await import('@modules/llm/providers/deepseek.provider');
    const provider = new DeepSeekProvider('test-key', 'deepseek-chat');

    await expect(provider.generate([{ role: 'user', content: 'hello' }])).rejects.toThrow(
      'DeepSeek API error: 500'
    );
  });

  it('should throw on 401 unauthorized', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' })
    );

    const { DeepSeekProvider } = await import('@modules/llm/providers/deepseek.provider');
    const provider = new DeepSeekProvider('bad-key', 'deepseek-chat');

    await expect(provider.generate([{ role: 'user', content: 'hello' }])).rejects.toThrow(
      'DeepSeek API error: 401'
    );
  });

  it('should throw on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    const { DeepSeekProvider } = await import('@modules/llm/providers/deepseek.provider');
    const provider = new DeepSeekProvider('test-key', 'deepseek-chat');

    await expect(provider.generate([{ role: 'user', content: 'hello' }])).rejects.toThrow(
      'fetch failed'
    );
  });

  it('should return empty string on empty response choices', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const { DeepSeekProvider } = await import('@modules/llm/providers/deepseek.provider');
    const provider = new DeepSeekProvider('test-key', 'deepseek-chat');

    const result = await provider.generate([{ role: 'user', content: 'hello' }]);
    expect(result).toBe('');
  });

  it('should throw descriptive error on health check failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Invalid API key provided', { status: 401, statusText: 'Unauthorized' })
    );

    const { DeepSeekProvider } = await import('@modules/llm/providers/deepseek.provider');
    const provider = new DeepSeekProvider('bad-key', 'deepseek-chat');

    await expect(provider.healthCheck()).rejects.toThrow('DeepSeek API error: 401');
  });

  it('should not leak API key in health check error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));

    const { DeepSeekProvider } = await import('@modules/llm/providers/deepseek.provider');
    const provider = new DeepSeekProvider('secret-api-key-12345', 'deepseek-chat');

    try {
      await provider.healthCheck();
    } catch (err) {
      expect((err as Error).message).not.toContain('secret-api-key-12345');
    }
  });

  it('should throw on stream error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Server Error', { status: 503, statusText: 'Service Unavailable' })
    );

    const { DeepSeekProvider } = await import('@modules/llm/providers/deepseek.provider');
    const provider = new DeepSeekProvider('test-key', 'deepseek-chat');

    const gen = provider.streamGenerate([{ role: 'user', content: 'hello' }]);
    await expect(gen.next()).rejects.toThrow('DeepSeek API error: 503');
  });

  it('should throw when stream has no body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    const { DeepSeekProvider } = await import('@modules/llm/providers/deepseek.provider');
    const provider = new DeepSeekProvider('test-key', 'deepseek-chat');

    const gen = provider.streamGenerate([{ role: 'user', content: 'hello' }]);
    await expect(gen.next()).rejects.toThrow('No response body');
  });
});

// ─── Zhipu LLM Provider Tests ───
describe('Zhipu LLM Error Injection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw on 5xx error from generate', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Server Error', { status: 500, statusText: 'Internal Server Error' })
    );

    const { ZhipuProvider } = await import('@modules/llm/providers/zhipu.provider');
    const provider = new ZhipuProvider('test-key', 'glm-4');

    await expect(provider.generate([{ role: 'user', content: 'hello' }])).rejects.toThrow();
  });

  it('should throw on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network error'));

    const { ZhipuProvider } = await import('@modules/llm/providers/zhipu.provider');
    const provider = new ZhipuProvider('test-key', 'glm-4');

    await expect(provider.generate([{ role: 'user', content: 'hello' }])).rejects.toThrow(
      'Network error'
    );
  });
});

// ─── Ollama LLM Provider Tests ───
describe('Ollama LLM Error Injection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw on non-ok response from generate', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('model not found', { status: 404, statusText: 'Not Found' })
    );

    const { OllamaProvider } = await import('@modules/llm/providers/ollama.provider');
    const provider = new OllamaProvider('http://localhost:11434', 'llama3');

    await expect(provider.generate([{ role: 'user', content: 'hello' }])).rejects.toThrow();
  });

  it('should throw on connection refused', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('fetch failed: Connection refused')
    );

    const { OllamaProvider } = await import('@modules/llm/providers/ollama.provider');
    const provider = new OllamaProvider('http://localhost:11434', 'llama3');

    await expect(provider.generate([{ role: 'user', content: 'hello' }])).rejects.toThrow(
      'fetch failed'
    );
  });
});

// ─── OpenAI LLM Provider Tests ───
describe('OpenAI LLM Error Injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should propagate SDK error from generate', async () => {
    openaiCreateMock.mockRejectedValue(new Error('API quota exceeded'));

    const { OpenAIProvider } = await import('@modules/llm/providers/openai.provider');
    const provider = new OpenAIProvider('test-key', 'gpt-4');

    await expect(provider.generate([{ role: 'user', content: 'hello' }])).rejects.toThrow(
      'API quota exceeded'
    );
  });

  it('should throw on health check failure', async () => {
    openaiCreateMock.mockRejectedValue(new Error('Invalid API key'));

    const { OpenAIProvider } = await import('@modules/llm/providers/openai.provider');
    const provider = new OpenAIProvider('test-key', 'gpt-4');

    await expect(provider.healthCheck()).rejects.toThrow('Invalid API key');
  });
});

// ─── Anthropic LLM Provider Tests ───
describe('Anthropic LLM Error Injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should propagate SDK error from generate', async () => {
    anthropicCreateMock.mockRejectedValue(new Error('API key invalid'));

    const { AnthropicProvider } = await import('@modules/llm/providers/anthropic.provider');
    const provider = new AnthropicProvider('test-key', 'claude-3-5-sonnet-20241022');

    await expect(provider.generate([{ role: 'user', content: 'hello' }])).rejects.toThrow(
      'API key invalid'
    );
  });

  it('should throw on health check failure with descriptive error', async () => {
    anthropicCreateMock.mockRejectedValue(new Error('Authentication failed'));

    const { AnthropicProvider } = await import('@modules/llm/providers/anthropic.provider');
    const provider = new AnthropicProvider('test-key', 'claude-3-5-sonnet-20241022');

    await expect(provider.healthCheck()).rejects.toThrow('Authentication failed');
  });
});
