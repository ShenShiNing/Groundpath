import type { Request, Response } from 'express';
import type {
  UpdateLLMConfigInput,
  TestLLMConnectionInput,
  FetchModelsInput,
} from '@groundpath/shared/schemas';
import { llmConfigService } from '../services/llm-config.service';
import { llmService } from '../services/llm.service';
import { modelFetcherService } from '../services/model-fetcher.service';
import { sendSuccessResponse, asyncHandler } from '@core/errors';
import { getValidatedBody } from '@core/middleware';
import { requireUserId } from '@core/utils';

export const llmConfigController = {
  /**
   * GET /api/v1/llm/config - Get user's LLM configuration
   */
  getConfig: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const config = await llmConfigService.getConfig(userId);
    sendSuccessResponse(res, config);
  }),

  /**
   * PUT /api/v1/llm/config - Create or update LLM configuration
   */
  updateConfig: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const parsed = getValidatedBody<UpdateLLMConfigInput>(res);
    const config = await llmConfigService.upsertConfig(userId, parsed);
    sendSuccessResponse(res, config);
  }),

  /**
   * DELETE /api/v1/llm/config - Delete user's LLM configuration
   */
  deleteConfig: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    await llmConfigService.deleteConfig(userId);
    sendSuccessResponse(res, null);
  }),

  /**
   * POST /api/v1/llm/test-connection - Test provider connection
   */
  testConnection: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const parsed = getValidatedBody<TestLLMConnectionInput>(res);
    const result = await llmService.testConnection(userId, parsed);
    sendSuccessResponse(res, result);
  }),

  /**
   * GET /api/v1/llm/providers - List available providers and models
   */
  getProviders: asyncHandler(async (_req: Request, res: Response) => {
    const providers = llmConfigService.getProviders();
    sendSuccessResponse(res, providers);
  }),

  /**
   * POST /api/v1/llm/models - Fetch available models for a provider
   */
  fetchModels: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const parsed = getValidatedBody<FetchModelsInput>(res);

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
  }),
};
