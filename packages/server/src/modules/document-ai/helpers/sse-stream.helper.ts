import type { Response } from 'express';
import type { DocumentAISSEEvent } from '@groundpath/shared/types';
import { DOCUMENT_AI_ERROR_CODES } from '@groundpath/shared/constants';
import type { LLMProvider, GenerateOptions, ChatMessage } from '@modules/llm';
import { createLogger } from '@core/logger';

const logger = createLogger('document-ai.sse');

/**
 * Count words in text (handles both CJK and English).
 */
export function countWords(text: string): number {
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
  const englishWords = text
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
  return cjkChars + englishWords;
}

/**
 * Send a single SSE event to the client.
 */
export function sendSSE(res: Response, event: DocumentAISSEEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Set standard SSE response headers and track client disconnection.
 *
 * Returns a helper object with `isDisconnected()` check and `cleanup()`.
 */
export function initSSEStream(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  let disconnected = false;
  const onClose = () => {
    disconnected = true;
  };
  res.on('close', onClose);

  return {
    isDisconnected: () => disconnected,
    cleanup: () => res.off('close', onClose),
  };
}

/**
 * Stream LLM output to the client via SSE, then send a `done` event.
 *
 * Returns the full accumulated content string.
 */
export async function streamLLMToSSE(
  res: Response,
  provider: LLMProvider,
  messages: ChatMessage[],
  genOptions: GenerateOptions,
  opts: {
    isDisconnected: () => boolean;
    signal?: AbortSignal;
  }
): Promise<string> {
  let fullContent = '';
  for await (const chunk of provider.streamGenerate(messages, {
    ...genOptions,
    signal: opts.signal,
  })) {
    if (opts.isDisconnected()) break;
    if (chunk.type !== 'content') continue;
    fullContent += chunk.text;
    sendSSE(res, { type: 'chunk', data: chunk.text });
  }

  if (!opts.isDisconnected()) {
    sendSSE(res, {
      type: 'done',
      data: {
        wordCount: countWords(fullContent),
        generatedAt: new Date().toISOString(),
      },
    });
  }
  return fullContent;
}

/**
 * Handle errors inside an SSE stream.
 *
 * Sends an error event (if the client is still connected and headers
 * haven't been flushed yet) and ends the response.
 */
export function handleSSEError(
  error: unknown,
  res: Response,
  isDisconnected: boolean,
  context?: string
): void {
  if (context) {
    logger.error({ error }, `SSE streaming failed: ${context}`);
  }

  if (!isDisconnected && !res.headersSent) {
    sendSSE(res, {
      type: 'error',
      data: {
        code: DOCUMENT_AI_ERROR_CODES.STREAMING_FAILED,
        message: error instanceof Error ? error.message : 'Streaming failed',
      },
    });
  }
  res.end();
}
