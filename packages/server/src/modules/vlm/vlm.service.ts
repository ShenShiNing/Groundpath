import pLimit from 'p-limit';
import { externalServiceConfig, vlmConfig } from '@config/env';
import { createLogger } from '@core/logger';
import { executeExternalCall } from '@core/utils/external-call';
import { getVLMProvider } from './vlm.factory';
import type { VLMDescribeOptions, VLMImageInput } from './vlm-provider.interface';

const logger = createLogger('vlm.service');
const limiter = pLimit(vlmConfig.concurrency);

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

      return executeExternalCall({
        service: 'vlm',
        operation: `${provider.name}.describeImage`,
        policy: externalServiceConfig.vlm,
        execute: (signal) => provider.describeImage({ ...options, signal }),
      });
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
