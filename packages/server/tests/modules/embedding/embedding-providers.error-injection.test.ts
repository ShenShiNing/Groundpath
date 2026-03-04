import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Mock config and logger ───
const { loggerMock } = vi.hoisted(() => ({
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@shared/logger', () => ({
  createLogger: () => loggerMock,
  logger: loggerMock,
}));

vi.mock('@config/env', () => ({
  embeddingConfig: {
    concurrency: 2,
    zhipu: { apiKey: 'test-key', model: 'embedding-2', dimensions: 1024 },
    openai: { apiKey: 'test-openai-key', model: 'text-embedding-3-small' },
    ollama: { baseUrl: 'http://localhost:11434', model: 'nomic-embed-text' },
  },
}));

// ─── Zhipu Provider Tests ───
describe('Zhipu Embedding Error Injection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw on 5xx server error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', { status: 500 })
    );

    const { ZhipuProvider } = await import('@modules/embedding/providers/zhipu.provider');
    const provider = new ZhipuProvider();

    await expect(provider.embed('test')).rejects.toThrow('Zhipu API error (500)');
  });

  it('should throw on 429 rate limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Rate Limited', { status: 429 }));

    const { ZhipuProvider } = await import('@modules/embedding/providers/zhipu.provider');
    const provider = new ZhipuProvider();

    await expect(provider.embed('test')).rejects.toThrow('Zhipu API error (429)');
  });

  it('should throw on 401 unauthorized', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Unauthorized', { status: 401 }));

    const { ZhipuProvider } = await import('@modules/embedding/providers/zhipu.provider');
    const provider = new ZhipuProvider();

    await expect(provider.embed('test')).rejects.toThrow('Zhipu API error (401)');
  });

  it('should throw on timeout (AbortError)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      const error = new DOMException('The operation was aborted', 'AbortError');
      return Promise.reject(error);
    });

    const { ZhipuProvider } = await import('@modules/embedding/providers/zhipu.provider');
    const provider = new ZhipuProvider();

    await expect(provider.embed('test')).rejects.toThrow('timed out');
  });

  it('should throw on empty/malformed response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const { ZhipuProvider } = await import('@modules/embedding/providers/zhipu.provider');
    const provider = new ZhipuProvider();

    await expect(provider.embed('test')).rejects.toThrow('unexpected response');
  });

  it('should throw on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    const { ZhipuProvider } = await import('@modules/embedding/providers/zhipu.provider');
    const provider = new ZhipuProvider();

    await expect(provider.embed('test')).rejects.toThrow('fetch failed');
  });

  it('should not leak API key in error messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Bad Request', { status: 400 }));

    const { ZhipuProvider } = await import('@modules/embedding/providers/zhipu.provider');
    const provider = new ZhipuProvider();

    try {
      await provider.embed('test');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).not.toContain('test-key');
    }
  });
});

// ─── Ollama Embedding Provider Tests ───
describe('Ollama Embedding Error Injection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw on server error from single embed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Model not found', { status: 404 })
    );

    const { OllamaProvider } = await import('@modules/embedding/providers/ollama.provider');
    const provider = new OllamaProvider();

    await expect(provider.embed('test')).rejects.toThrow('Ollama API error (404)');
  });

  it('should throw on timeout (AbortError) from single embed', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    });

    const { OllamaProvider } = await import('@modules/embedding/providers/ollama.provider');
    const provider = new OllamaProvider();

    await expect(provider.embed('test')).rejects.toThrow('timed out');
  });

  it('should fall back to sequential when batch endpoint fails with non-abort error', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/api/embed')) {
        // Batch endpoint fails (non-ok response triggers fallback)
        return new Response('Not Found', { status: 404 });
      }
      // Single embed endpoint (/api/embeddings) succeeds
      return new Response(JSON.stringify({ embedding: [0.1, 0.2, 0.3] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const { OllamaProvider } = await import('@modules/embedding/providers/ollama.provider');
    const provider = new OllamaProvider();

    const results = await provider.embedBatch(['text1', 'text2']);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual([0.1, 0.2, 0.3]);
  });

  it('should throw on timeout during batch embed', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    });

    const { OllamaProvider } = await import('@modules/embedding/providers/ollama.provider');
    const provider = new OllamaProvider();

    await expect(provider.embedBatch(['text1'])).rejects.toThrow('timed out');
  });
});

// ─── OpenAI Embedding Provider Tests ───
const { openaiEmbeddingCreateMock } = vi.hoisted(() => ({
  openaiEmbeddingCreateMock: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    embeddings = {
      create: openaiEmbeddingCreateMock,
    };
  },
}));

describe('OpenAI Embedding Error Injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should propagate SDK error on embed failure', async () => {
    openaiEmbeddingCreateMock.mockRejectedValue(new Error('API key invalid'));

    const { OpenAIProvider } = await import('@modules/embedding/providers/openai.provider');
    const provider = new OpenAIProvider();

    await expect(provider.embed('test')).rejects.toThrow('API key invalid');
  });

  it('should propagate SDK error on batch embed failure', async () => {
    openaiEmbeddingCreateMock.mockRejectedValue(new Error('Rate limited'));

    const { OpenAIProvider } = await import('@modules/embedding/providers/openai.provider');
    const provider = new OpenAIProvider();

    await expect(provider.embedBatch(['text1', 'text2'])).rejects.toThrow('Rate limited');
  });
});
