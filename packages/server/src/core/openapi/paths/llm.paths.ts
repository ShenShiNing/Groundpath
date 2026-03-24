import { z } from '@groundpath/shared/schemas';
import {
  updateLLMConfigSchema,
  testLLMConnectionSchema,
  fetchModelsSchema,
} from '@groundpath/shared/schemas';
import { errorResponse, messageResponse, successResponse } from '../registry';
import { defineOpenApiOperations } from '../route-metadata';

const llmConfigItem = z.object({
  id: z.string(),
  provider: z.string(),
  model: z.string(),
  baseUrl: z.string().nullable(),
  temperature: z.number(),
  maxTokens: z.number(),
  topP: z.number(),
});

export const llmOpenApiOperations = defineOpenApiOperations({
  'GET /api/v1/llm/config': {
    summary: '获取 LLM 配置',
    responses: { 200: successResponse(llmConfigItem, 'LLM 配置') },
  },
  'PUT /api/v1/llm/config': {
    summary: '更新 LLM 配置',
    request: { body: { content: { 'application/json': { schema: updateLLMConfigSchema } } } },
    responses: { 200: successResponse(llmConfigItem, '配置更新成功'), 400: errorResponse },
  },
  'DELETE /api/v1/llm/config': {
    summary: '删除 LLM 配置',
    responses: { 200: messageResponse('配置已删除') },
  },
  'POST /api/v1/llm/test-connection': {
    summary: '测试 LLM 连接',
    request: { body: { content: { 'application/json': { schema: testLLMConnectionSchema } } } },
    responses: { 200: messageResponse('连接成功'), 400: errorResponse },
  },
  'GET /api/v1/llm/providers': {
    summary: '获取 LLM 提供商列表',
    responses: {
      200: successResponse(z.array(z.object({ id: z.string(), name: z.string() })), '提供商列表'),
    },
  },
  'POST /api/v1/llm/models': {
    summary: '获取模型列表',
    request: { body: { content: { 'application/json': { schema: fetchModelsSchema } } } },
    responses: {
      200: successResponse(z.array(z.object({ id: z.string(), name: z.string() })), '模型列表'),
      400: errorResponse,
    },
  },
});
