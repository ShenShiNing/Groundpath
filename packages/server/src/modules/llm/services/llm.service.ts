import type { LLMProviderType } from '@knowledge-agent/shared/types';
import { LLM_ERROR_CODES } from '@knowledge-agent/shared/constants';
import { createLLMProvider } from '../llm.factory';
import { llmConfigService } from './llm-config.service';
import type { LLMProvider, GenerateOptions } from '../providers/llm-provider.interface';
import { Errors } from '@shared/errors';
import { logger } from '@shared/logger';

export const llmService = {
  /**
   * Get an LLM provider configured for the given user.
   * Uses the user's saved configuration (provider, model, API key).
   */
  async getProviderForUser(userId: string): Promise<LLMProvider> {
    const config = await llmConfigService.getFullConfig(userId);
    if (!config) {
      throw Errors.auth(
        LLM_ERROR_CODES.LLM_CONFIG_NOT_FOUND,
        'LLM not configured. Please set up your AI provider in Settings.',
        400
      );
    }

    try {
      return createLLMProvider(config.provider, {
        apiKey: config.apiKey ?? undefined,
        model: config.model,
        baseUrl: config.baseUrl ?? undefined,
      });
    } catch (error) {
      logger.error({ error, userId, provider: config.provider }, 'Failed to create LLM provider');
      throw Errors.auth(
        LLM_ERROR_CODES.LLM_CONNECTION_FAILED,
        `Failed to connect to ${config.provider}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  },

  /**
   * Get generation options from user's config.
   */
  async getOptionsForUser(userId: string): Promise<GenerateOptions> {
    const config = await llmConfigService.getFullConfig(userId);
    if (!config) return {};

    return {
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
    };
  },

  /**
   * Test connection with given or saved configuration.
   */
  async testConnection(
    userId: string,
    overrides?: {
      provider?: LLMProviderType;
      model?: string;
      apiKey?: string;
      baseUrl?: string;
    }
  ): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    let provider: LLMProvider;

    const start = Date.now();

    try {
      if (overrides?.provider || overrides?.apiKey) {
        // Test with provided overrides
        const config = await llmConfigService.getFullConfig(userId);
        const finalProvider = overrides.provider ?? config?.provider ?? 'openai';
        const finalModel = overrides.model ?? config?.model ?? 'gpt-4o-mini';
        const finalApiKey = overrides.apiKey ?? config?.apiKey ?? undefined;
        const finalBaseUrl = overrides.baseUrl ?? config?.baseUrl ?? undefined;

        provider = createLLMProvider(finalProvider, {
          apiKey: finalApiKey,
          model: finalModel,
          baseUrl: finalBaseUrl,
        });
      } else {
        // Test with saved config
        provider = await this.getProviderForUser(userId);
      }

      const healthy = await provider.healthCheck();
      const latencyMs = Date.now() - start;

      if (healthy) {
        return { success: true, message: 'Connection successful', latencyMs };
      }
      return { success: false, message: 'Provider health check failed' };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const message = error instanceof Error ? error.message : 'Connection failed';
      return { success: false, message, latencyMs };
    }
  },
};
