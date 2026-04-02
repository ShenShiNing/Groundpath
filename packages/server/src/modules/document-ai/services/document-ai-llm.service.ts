/**
 * Document AI LLM Service
 * Unified LLM calling layer with concurrency limiting and logging
 */

import pLimit from 'p-limit';
import { llmService } from '@modules/llm/public/runtime';
import type { ChatMessage, GenerateOptions } from '@modules/llm/public/runtime';
import { Errors } from '@core/errors';
import { createLogger } from '@core/logger';

const logger = createLogger('document-ai-llm');

// Default concurrency limit (can be overridden via env)
const DEFAULT_CONCURRENCY = 3;

// Create limiter instance
const limiter = pLimit(
  process.env.DOCUMENT_AI_LLM_CONCURRENCY
    ? parseInt(process.env.DOCUMENT_AI_LLM_CONCURRENCY, 10)
    : DEFAULT_CONCURRENCY
);

export interface DocumentAILLMOptions extends Partial<GenerateOptions> {
  userId: string;
  operationId?: string;
  promptVersion?: string;
  signal?: AbortSignal;
}

export interface BatchRequest {
  messages: ChatMessage[];
  options: DocumentAILLMOptions;
}

export interface BatchResult {
  success: boolean;
  result?: string;
  error?: Error;
}

export const documentAiLlmService = {
  /**
   * Get current concurrency limit
   */
  getConcurrencyLimit(): number {
    return limiter.concurrency;
  },

  /**
   * Get number of pending requests
   */
  getPendingCount(): number {
    return limiter.pendingCount;
  },

  /**
   * Get number of active requests
   */
  getActiveCount(): number {
    return limiter.activeCount;
  },

  /**
   * Generate response with concurrency limiting
   */
  async generate(messages: ChatMessage[], options: DocumentAILLMOptions): Promise<string> {
    const { userId, operationId, promptVersion, signal, ...genOptions } = options;

    return limiter(async () => {
      const startTime = Date.now();

      logger.info(
        { operationId, promptVersion, pendingCount: limiter.pendingCount },
        'LLM generate start'
      );

      // Check if aborted before starting
      if (signal?.aborted) {
        throw Errors.aborted('Operation aborted');
      }

      try {
        const provider = await llmService.getProviderForUser(userId);
        const userOptions = await llmService.getOptionsForUser(userId);

        const result = await provider.generate(messages, {
          ...userOptions,
          ...genOptions,
        });

        logger.info(
          {
            operationId,
            promptVersion,
            latencyMs: Date.now() - startTime,
            resultLength: result.length,
          },
          'LLM generate success'
        );

        return result;
      } catch (error) {
        logger.error(
          {
            operationId,
            error,
            latencyMs: Date.now() - startTime,
          },
          'LLM generate failed'
        );
        throw error;
      }
    });
  },

  /**
   * Stream generate with concurrency limiting
   * Note: Limiter controls start timing, releases after stream completes
   */
  async *streamGenerate(
    messages: ChatMessage[],
    options: DocumentAILLMOptions
  ): AsyncGenerator<string, void, unknown> {
    const { userId, operationId, promptVersion, signal, ...genOptions } = options;

    // Acquire concurrency slot
    const release = await new Promise<() => void>((resolve) => {
      limiter(
        () =>
          new Promise<void>((innerResolve) => {
            resolve(innerResolve);
          })
      );
    });

    const startTime = Date.now();
    let chunkCount = 0;
    let totalLength = 0;

    logger.info({ operationId, promptVersion }, 'LLM stream start');

    try {
      // Check if aborted before starting
      if (signal?.aborted) {
        throw Errors.aborted('Operation aborted');
      }

      const provider = await llmService.getProviderForUser(userId);
      const userOptions = await llmService.getOptionsForUser(userId);

      for await (const chunk of provider.streamGenerate(messages, {
        ...userOptions,
        ...genOptions,
        signal,
      })) {
        if (chunk.type !== 'content') continue;
        chunkCount++;
        totalLength += chunk.text.length;
        yield chunk.text;
      }

      logger.info(
        {
          operationId,
          promptVersion,
          latencyMs: Date.now() - startTime,
          chunkCount,
          totalLength,
        },
        'LLM stream success'
      );
    } catch (error) {
      // Don't log abort errors as failures
      if (error instanceof Error && error.name === 'AbortError') {
        logger.info({ operationId }, 'LLM stream aborted by client');
      } else {
        logger.error(
          {
            operationId,
            error,
            latencyMs: Date.now() - startTime,
          },
          'LLM stream failed'
        );
      }
      throw error;
    } finally {
      release();
    }
  },

  /**
   * Batch generate multiple requests with concurrency limiting
   * Returns results in same order as requests
   */
  async batchGenerate(requests: BatchRequest[]): Promise<BatchResult[]> {
    const startTime = Date.now();

    logger.info({ requestCount: requests.length }, 'LLM batch generate start');

    const results = await Promise.allSettled(
      requests.map((req) => this.generate(req.messages, req.options))
    );

    const mappedResults: BatchResult[] = results.map((r) =>
      r.status === 'fulfilled'
        ? { success: true, result: r.value }
        : { success: false, error: r.reason as Error }
    );

    const successCount = mappedResults.filter((r) => r.success).length;

    logger.info(
      {
        requestCount: requests.length,
        successCount,
        failureCount: requests.length - successCount,
        latencyMs: Date.now() - startTime,
      },
      'LLM batch generate completed'
    );

    return mappedResults;
  },

  /**
   * Clear the limiter queue (for graceful shutdown)
   */
  clearQueue(): void {
    limiter.clearQueue();
    logger.info('LLM limiter queue cleared');
  },
};
