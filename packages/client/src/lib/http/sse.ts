/**
 * SSE stream parsing utilities.
 * Handles TextDecoder, buffer management, and event dispatch.
 */

export interface SSEEventHandlers<T> {
  onEvent: (event: T) => void;
  onError: (error: { code: string; message: string }) => void;
}

export interface SSEParserOptions {
  /** Called when stream parsing completes normally */
  onComplete?: () => void;
}

/**
 * Parse an SSE stream and dispatch events via handlers.
 *
 * @param reader - ReadableStream reader from fetch response body
 * @param handlers - Event handlers for parsed events and errors
 * @param options - Optional callbacks for completion
 */
export async function parseSSEStream<T>(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  handlers: SSEEventHandlers<T>,
  options?: SSEParserOptions
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const event = JSON.parse(jsonStr) as T;
          handlers.onEvent(event);
        } catch {
          // Skip malformed JSON
        }
      }
    }

    options?.onComplete?.();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return; // Intentional abort, don't report as error
    }
    handlers.onError({
      code: 'STREAM_ERROR',
      message: error instanceof Error ? error.message : 'Stream failed',
    });
  }
}

/**
 * Create a typed event dispatcher that routes SSE events by their type field.
 *
 * @param typeHandlers - Map of event type to handler function
 * @param fallbackError - Called when an unknown event or error is received
 * @returns SSEEventHandlers instance for use with parseSSEStream
 *
 * @example
 * ```ts
 * const dispatcher = createSSEDispatcher<SSEEvent>(
 *   {
 *     chunk: (data) => console.log('chunk:', data),
 *     sources: (data) => console.log('sources:', data),
 *     done: (data) => console.log('done:', data),
 *     error: (data) => console.error('error:', data),
 *   },
 *   (error) => console.error('Fallback error:', error)
 * );
 * ```
 */
export function createSSEDispatcher<TEvent extends { type: string; data: unknown }>(
  typeHandlers: {
    [K in TEvent['type']]?: (data: Extract<TEvent, { type: K }>['data']) => void;
  },
  fallbackError: (error: { code: string; message: string }) => void
): SSEEventHandlers<TEvent> {
  return {
    onEvent: (event) => {
      const handler = typeHandlers[event.type as TEvent['type']];
      if (handler) {
        handler(event.data as Extract<TEvent, { type: typeof event.type }>['data']);
      }
    },
    onError: fallbackError,
  };
}
