import { v4 as uuidv4 } from 'uuid';
import type {
  LLMProviderType,
  LLMConfigInfo,
  LLMProviderInfo,
} from '@knowledge-agent/shared/types';
import { LLM_ERROR_CODES } from '@knowledge-agent/shared/constants';
import { llmConfigRepository } from '../repositories/llm-config.repository';
import { encryptionService } from './encryption.service';
import { Errors } from '@shared/errors';
import { logger } from '@shared/logger';
import type { LLMConfig } from '@shared/db/schema/ai/llm-configs.schema';

function toConfigInfo(config: LLMConfig): LLMConfigInfo {
  let apiKeyMasked: string | null = null;
  if (config.apiKeyEncrypted) {
    try {
      const decrypted = encryptionService.decrypt(config.apiKeyEncrypted);
      apiKeyMasked = encryptionService.maskApiKey(decrypted);
    } catch {
      apiKeyMasked = '****';
    }
  }

  return {
    id: config.id,
    userId: config.userId,
    provider: config.provider as LLMProviderType,
    model: config.model,
    apiKeyMasked,
    hasApiKey: !!config.apiKeyEncrypted,
    baseUrl: config.baseUrl,
    temperature: Number(config.temperature),
    maxTokens: config.maxTokens,
    topP: Number(config.topP),
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

export const llmConfigService = {
  /**
   * Get user's LLM configuration
   */
  async getConfig(userId: string): Promise<LLMConfigInfo | null> {
    const config = await llmConfigRepository.findByUserId(userId);
    if (!config) return null;
    return toConfigInfo(config);
  },

  /**
   * Delete user's LLM configuration
   */
  async deleteConfig(userId: string): Promise<void> {
    await llmConfigRepository.deleteByUserId(userId);
  },

  /**
   * Create or update user's LLM configuration
   */
  async upsertConfig(
    userId: string,
    data: {
      provider?: LLMProviderType;
      model?: string;
      apiKey?: string;
      baseUrl?: string | null;
      temperature?: number;
      maxTokens?: number;
      topP?: number;
    }
  ): Promise<LLMConfigInfo> {
    const existing = await llmConfigRepository.findByUserId(userId);

    let apiKeyEncrypted: string | undefined;
    if (data.apiKey) {
      apiKeyEncrypted = encryptionService.encrypt(data.apiKey);
    }

    if (existing) {
      const updateData: Record<string, unknown> = {};
      if (data.provider !== undefined) updateData.provider = data.provider;
      if (data.model !== undefined) updateData.model = data.model;
      if (apiKeyEncrypted !== undefined) updateData.apiKeyEncrypted = apiKeyEncrypted;
      if (data.baseUrl !== undefined) updateData.baseUrl = data.baseUrl;
      if (data.temperature !== undefined) updateData.temperature = String(data.temperature);
      if (data.maxTokens !== undefined) updateData.maxTokens = data.maxTokens;
      if (data.topP !== undefined) updateData.topP = String(data.topP);

      const updated = await llmConfigRepository.updateByUserId(userId, updateData);
      return toConfigInfo(updated!);
    }

    // Create new config
    const provider = data.provider ?? 'openai';
    const model = data.model ?? '';

    const newConfig = await llmConfigRepository.create({
      id: uuidv4(),
      userId,
      provider,
      model,
      apiKeyEncrypted: apiKeyEncrypted ?? null,
      baseUrl: data.baseUrl ?? null,
      temperature: String(data.temperature ?? 0.7),
      maxTokens: data.maxTokens ?? 2048,
      topP: String(data.topP ?? 1.0),
    });

    return toConfigInfo(newConfig);
  },

  /**
   * Get decrypted API key for a user's config (internal use only)
   */
  async getDecryptedApiKey(userId: string): Promise<string | null> {
    const config = await llmConfigRepository.findByUserId(userId);
    if (!config?.apiKeyEncrypted) return null;

    try {
      return encryptionService.decrypt(config.apiKeyEncrypted);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to decrypt API key');
      throw Errors.auth(LLM_ERROR_CODES.LLM_DECRYPTION_FAILED, 'Failed to decrypt API key', 500);
    }
  },

  /**
   * Get full LLM config with decrypted key (internal use only)
   */
  async getFullConfig(userId: string): Promise<{
    provider: LLMProviderType;
    model: string;
    apiKey: string | null;
    baseUrl: string | null;
    temperature: number;
    maxTokens: number;
    topP: number;
  } | null> {
    const config = await llmConfigRepository.findByUserId(userId);
    if (!config) return null;

    let apiKey: string | null = null;
    if (config.apiKeyEncrypted) {
      try {
        apiKey = encryptionService.decrypt(config.apiKeyEncrypted);
      } catch (error) {
        logger.error({ error, userId }, 'Failed to decrypt API key');
        throw Errors.auth(LLM_ERROR_CODES.LLM_DECRYPTION_FAILED, 'Failed to decrypt API key', 500);
      }
    }

    return {
      provider: config.provider as LLMProviderType,
      model: config.model,
      apiKey,
      baseUrl: config.baseUrl,
      temperature: Number(config.temperature),
      maxTokens: config.maxTokens,
      topP: Number(config.topP),
    };
  },

  /**
   * Get available providers
   */
  getProviders(): LLMProviderInfo[] {
    return [
      {
        provider: 'openai',
        name: 'OpenAI',
        requiresApiKey: true,
        requiresBaseUrl: false,
      },
      {
        provider: 'anthropic',
        name: 'Anthropic',
        requiresApiKey: true,
        requiresBaseUrl: false,
      },
      {
        provider: 'zhipu',
        name: 'Zhipu AI',
        requiresApiKey: true,
        requiresBaseUrl: false,
      },
      {
        provider: 'deepseek',
        name: 'DeepSeek',
        requiresApiKey: true,
        requiresBaseUrl: false,
      },
      {
        provider: 'ollama',
        name: 'Ollama (Local)',
        requiresApiKey: false,
        requiresBaseUrl: false,
        optionalBaseUrl: true,
        defaultBaseUrl: 'http://localhost:11434',
      },
      {
        provider: 'custom',
        name: 'Custom (Third-party Proxy)',
        requiresApiKey: true,
        requiresBaseUrl: true,
      },
    ];
  },
};
