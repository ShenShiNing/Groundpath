import type { Request, Response } from 'express';
import {
  updateLLMConfigSchema,
  testLLMConnectionSchema,
  fetchModelsSchema,
} from '@groundpath/shared/schemas';
import { llmConfigService } from '../services/llm-config.service';
import { llmService } from '../services/llm.service';
import { modelFetcherService } from '../services/model-fetcher.service';
import { sendSuccessResponse, handleError } from '@core/errors';

export const llmConfigController = {
  /**
   * GET /api/llm/config - Get user's LLM configuration
   */
  async getConfig(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const config = await llmConfigService.getConfig(userId);
      sendSuccessResponse(res, config);
    } catch (error) {
      handleError(error, res, 'Get LLM config');
    }
  },

  /**
   * PUT /api/llm/config - Create or update LLM configuration
   */
  async updateConfig(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const parsed = updateLLMConfigSchema.parse(req.body);
      const config = await llmConfigService.upsertConfig(userId, parsed);
      sendSuccessResponse(res, config);
    } catch (error) {
      handleError(error, res, 'Update LLM config');
    }
  },

  /**
   * DELETE /api/llm/config - Delete user's LLM configuration
   */
  async deleteConfig(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      await llmConfigService.deleteConfig(userId);
      sendSuccessResponse(res, null);
    } catch (error) {
      handleError(error, res, 'Delete LLM config');
    }
  },

  /**
   * POST /api/llm/test-connection - Test provider connection
   */
  async testConnection(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const parsed = testLLMConnectionSchema.parse(req.body);
      const result = await llmService.testConnection(userId, parsed);
      sendSuccessResponse(res, result);
    } catch (error) {
      handleError(error, res, 'Test LLM connection');
    }
  },

  /**
   * GET /api/llm/providers - List available providers and models
   */
  async getProviders(_req: Request, res: Response): Promise<void> {
    try {
      const providers = llmConfigService.getProviders();
      sendSuccessResponse(res, providers);
    } catch (error) {
      handleError(error, res, 'Get LLM providers');
    }
  },

  /**
   * POST /api/llm/models - Fetch available models for a provider
   */
  async fetchModels(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const parsed = fetchModelsSchema.parse(req.body);

      // If no API key provided, try to get from user's saved config
      let apiKey = parsed.apiKey;
      let baseUrl = parsed.baseUrl;

      if (!apiKey) {
        const savedConfig = await llmConfigService.getFullConfig(userId);
        if (savedConfig && savedConfig.provider === parsed.provider) {
          apiKey = savedConfig.apiKey ?? undefined;
          baseUrl = baseUrl ?? savedConfig.baseUrl ?? undefined;
        }
      }

      const models = await modelFetcherService.fetchModels(parsed.provider, {
        apiKey,
        baseUrl,
      });

      sendSuccessResponse(res, {
        models,
        fromCache: false,
      });
    } catch (error) {
      handleError(error, res, 'Fetch LLM models');
    }
  },
};
