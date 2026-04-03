import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@config/env', () => ({
  externalServiceConfig: {
    llm: {
      timeoutMs: 30_000,
      maxRetries: 0,
      baseDelayMs: 100,
      maxDelayMs: 1_000,
    },
  },
}));

vi.mock('@core/logger', () => ({
  createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { DeepSeekProvider } from '@modules/llm/providers/deepseek.provider';

import type { StreamChunk } from '@modules/llm/providers/llm-provider.interface';

// Helper: encode SSE stream chunks
function encodeSSE(events: Array<{ data: string }>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = events.map((e) => encoder.encode(`data: ${e.data}\n\n`));
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index]!);
        index++;
      } else {
        controller.close();
      }
    },
  });
}

describe('DeepSeekProvider', () => {
  let provider: DeepSeekProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new DeepSeekProvider('test-key', 'deepseek-reasoner');
  });

  describe('generate', () => {
    it('returns content when present', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Hello', reasoning_content: 'thinking...' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const result = await provider.generate([{ role: 'user', content: 'Hi' }]);
      expect(result).toBe('Hello');
    });

    it('returns empty string when content is empty (does not leak reasoning)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '', reasoning_content: 'thinking output' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const result = await provider.generate([{ role: 'user', content: 'Hi' }]);
      expect(result).toBe('');
    });

    it('falls back to reasoning_content when content is missing', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { reasoning_content: 'only reasoning' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const result = await provider.generate([{ role: 'user', content: 'Hi' }]);
      expect(result).toBe('only reasoning');
    });

    it('returns empty string when both content and reasoning_content are missing', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: {} }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await provider.generate([{ role: 'user', content: 'Hi' }]);
      expect(result).toBe('');
    });
  });

  describe('streamGenerate', () => {
    it('yields content chunks', async () => {
      const stream = encodeSSE([
        { data: JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] }) },
        { data: JSON.stringify({ choices: [{ delta: { content: ' world' } }] }) },
        { data: '[DONE]' },
      ]);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(stream, { status: 200 }));

      const chunks: StreamChunk[] = [];
      for await (const chunk of provider.streamGenerate([{ role: 'user', content: 'Hi' }])) {
        chunks.push(chunk);
      }
      expect(chunks).toEqual([
        { type: 'content', text: 'Hello' },
        { type: 'content', text: ' world' },
      ]);
    });

    it('yields reasoning_content as reasoning chunks', async () => {
      const stream = encodeSSE([
        { data: JSON.stringify({ choices: [{ delta: { reasoning_content: 'step 1' } }] }) },
        { data: JSON.stringify({ choices: [{ delta: { reasoning_content: ' step 2' } }] }) },
        { data: JSON.stringify({ choices: [{ delta: { content: 'final answer' } }] }) },
        { data: '[DONE]' },
      ]);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(stream, { status: 200 }));

      const chunks: StreamChunk[] = [];
      for await (const chunk of provider.streamGenerate([{ role: 'user', content: 'Hi' }])) {
        chunks.push(chunk);
      }
      expect(chunks).toEqual([
        { type: 'reasoning', text: 'step 1' },
        { type: 'reasoning', text: ' step 2' },
        { type: 'content', text: 'final answer' },
      ]);
    });

    it('yields nothing for empty deltas', async () => {
      const stream = encodeSSE([
        { data: JSON.stringify({ choices: [{ delta: {} }] }) },
        { data: '[DONE]' },
      ]);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(stream, { status: 200 }));

      const chunks: StreamChunk[] = [];
      for await (const chunk of provider.streamGenerate([{ role: 'user', content: 'Hi' }])) {
        chunks.push(chunk);
      }
      expect(chunks).toEqual([]);
    });
  });
});
