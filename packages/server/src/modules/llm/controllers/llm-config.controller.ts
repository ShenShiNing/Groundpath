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

export const llmConfigController = {
  /**
   * GET /api/llm/config - Get user's LLM configuration
   */
  getConfig: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.sub;
    const config = await llmConfigService.getConfig(userId);
    sendSuccessResponse(res, config);
  }),

  /**
   * PUT /api/llm/config - Create or update LLM configuration
   */
  updateConfig: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.sub;
    const parsed = getValidatedBody<UpdateLLMConfigInput>(res);
    const config = await llmConfigService.upsertConfig(userId, parsed);
    sendSuccessResponse(res, config);
  }),

  /**
   * DELETE /api/llm/config - Delete user's LLM configuration
   */
  deleteConfig: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.sub;
    await llmConfigService.deleteConfig(userId);
    sendSuccessResponse(res, null);
  }),

  /**
   * POST /api/llm/test-connection - Test provider connection
   */
  testConnection: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.sub;
    const parsed = getValidatedBody<TestLLMConnectionInput>(res);
    const result = await llmService.testConnection(userId, parsed);
    sendSuccessResponse(res, result);
  }),

  /**
   * GET /api/llm/providers - List available providers and models
   */
  getProviders: asyncHandler(async (_req: Request, res: Response) => {
    const providers = llmConfigService.getProviders();
    sendSuccessResponse(res, providers);
  }),

  /**
   * POST /api/llm/models - Fetch available models for a provider
   */
  fetchModels: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.sub;
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
