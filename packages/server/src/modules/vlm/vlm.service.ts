import pLimit from 'p-limit';
import { vlmConfig } from '@config/env';
import { createLogger } from '@shared/logger';
import { getVLMProvider } from './vlm.factory';
import type { VLMDescribeOptions, VLMImageInput } from './vlm-provider.interface';

const logger = createLogger('vlm.service');
const limiter = pLimit(vlmConfig.concurrency);

function isRetryableStatusCode(error: unknown): boolean {
  const status =
    (error as { status?: number }).status ?? (error as { statusCode?: number }).statusCode;
  if (!status) return false;
  return status === 429 || status >= 500;
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries || !isRetryableStatusCode(error)) {
        throw error;
      }
      const backoffMs = Math.min(1000 * 2 ** attempt, 15000);
      logger.warn(
        { attempt: attempt + 1, maxRetries, backoffMs },
        'VLM call failed with retryable error, retrying'
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`VLM call timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export interface VLMServiceDescribeInput {
  image: VLMImageInput;
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
}

export interface VLMServiceBatchResult {
  index: number;
  description: string | null;
  success: boolean;
  error?: string;
}

export const vlmService = {
  async describeImage(input: VLMServiceDescribeInput): Promise<string> {
    return limiter(async () => {
      const provider = getVLMProvider();
      const options: VLMDescribeOptions = {
        image: input.image,
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        maxTokens: input.maxTokens ?? vlmConfig.maxTokens,
        temperature: 0.2,
      };

      return withRetry(
        () => withTimeout(provider.describeImage(options), vlmConfig.timeoutMs),
        vlmConfig.maxRetries
      );
    });
  },

  async describeImageBatch(inputs: VLMServiceDescribeInput[]): Promise<VLMServiceBatchResult[]> {
    const results = await Promise.allSettled(
      inputs.map((input, index) =>
        this.describeImage(input).then((description) => ({ index, description }))
      )
    );

    return results.map((result, i) => {
      if (result.status === 'fulfilled') {
        return {
          index: result.value.index,
          description: result.value.description,
          success: true,
        };
      }

      const errorMessage =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      logger.warn({ index: i, error: errorMessage }, 'VLM batch item failed');
      return {
        index: i,
        description: null,
        success: false,
        error: errorMessage,
      };
    });
  },
};
