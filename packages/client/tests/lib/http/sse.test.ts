import { describe, expect, it, vi } from 'vitest';
import { parseSSEStream, type SSEEventHandlers } from '@/lib/http/sse';

// Helper: create a reader from string chunks
function createReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]!));
        index++;
      } else {
        controller.close();
      }
    },
  }).getReader();
}

describe('parseSSEStream', () => {
  it('parses multiple SSE events', async () => {
    const events: unknown[] = [];
    const handlers: SSEEventHandlers<{ type: string }> = {
      onEvent: (event) => events.push(event),
      onError: vi.fn(),
    };

    const reader = createReader(['data: {"type":"chunk"}\n\ndata: {"type":"done"}\n\n']);

    await parseSSEStream(reader, handlers);

    expect(events).toEqual([{ type: 'chunk' }, { type: 'done' }]);
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('skips malformed JSON without affecting subsequent events', async () => {
    const events: unknown[] = [];
    const handlers: SSEEventHandlers<{ type: string }> = {
      onEvent: (event) => events.push(event),
      onError: vi.fn(),
    };

    const reader = createReader(['data: not-json\n\ndata: {"type":"valid"}\n\n']);

    await parseSSEStream(reader, handlers);

    expect(events).toEqual([{ type: 'valid' }]);
  });

  it('does not swallow handler errors as JSON parse errors', async () => {
    const handlerError = new Error('handler bug');
    let callCount = 0;

    const handlers: SSEEventHandlers<{ type: string }> = {
      onEvent: () => {
        callCount++;
        throw handlerError;
      },
      onError: vi.fn(),
    };

    // Two events — both should be dispatched even though handler throws each time
    const reader = createReader(['data: {"type":"a"}\n\ndata: {"type":"b"}\n\n']);

    await parseSSEStream(reader, handlers);

    // Handler was invoked for each event (errors swallowed, stream stayed alive)
    expect(callCount).toBe(2);
    // Stream-level onError should NOT be called for handler errors
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('processes remaining buffer data after stream ends', async () => {
    const events: unknown[] = [];
    const handlers: SSEEventHandlers<{ type: string }> = {
      onEvent: (event) => events.push(event),
      onError: vi.fn(),
    };

    // Last event has no trailing newline — remains in buffer
    const reader = createReader(['data: {"type":"chunk"}\n\n', 'data: {"type":"done"}']);

    await parseSSEStream(reader, handlers);

    expect(events).toEqual([{ type: 'chunk' }, { type: 'done' }]);
  });

  it('calls onComplete after successful parsing', async () => {
    const onComplete = vi.fn();
    const handlers: SSEEventHandlers<unknown> = {
      onEvent: vi.fn(),
      onError: vi.fn(),
    };

    const reader = createReader(['data: {"ok":true}\n\n']);

    await parseSSEStream(reader, handlers, { onComplete });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('reports stream errors via onError', async () => {
    const handlers: SSEEventHandlers<unknown> = {
      onEvent: vi.fn(),
      onError: vi.fn(),
    };

    // Create a reader that errors
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('network failure'));
      },
    });

    await parseSSEStream(stream.getReader(), handlers);

    expect(handlers.onError).toHaveBeenCalledWith({
      code: 'STREAM_ERROR',
      message: 'network failure',
    });
  });

  it('silently handles AbortError', async () => {
    const handlers: SSEEventHandlers<unknown> = {
      onEvent: vi.fn(),
      onError: vi.fn(),
    };

    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(abortError);
      },
    });

    await parseSSEStream(stream.getReader(), handlers);

    expect(handlers.onError).not.toHaveBeenCalled();
  });
});
