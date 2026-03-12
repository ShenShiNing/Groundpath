import { z } from '@knowledge-agent/shared/schemas';
import { registry, successResponse, messageResponse, errorResponse, PROTECTED } from '../registry';
import {
  updateLLMConfigSchema,
  testLLMConnectionSchema,
  fetchModelsSchema,
} from '@knowledge-agent/shared/schemas';

const llmConfigItem = z.object({
  id: z.string(),
  provider: z.string(),
  model: z.string(),
  baseUrl: z.string().nullable(),
  temperature: z.number(),
  maxTokens: z.number(),
  topP: z.number(),
});

// GET /api/llm/config
registry.registerPath({
  method: 'get',
  path: '/api/llm/config',
  tags: ['LLM'],
  summary: '获取 LLM 配置',
  security: PROTECTED,
  responses: { 200: successResponse(llmConfigItem, 'LLM 配置') },
});

// PUT /api/llm/config
registry.registerPath({
  method: 'put',
  path: '/api/llm/config',
  tags: ['LLM'],
  summary: '更新 LLM 配置',
  security: PROTECTED,
  request: { body: { content: { 'application/json': { schema: updateLLMConfigSchema } } } },
  responses: { 200: successResponse(llmConfigItem, '配置更新成功'), 400: errorResponse },
});

// DELETE /api/llm/config
registry.registerPath({
  method: 'delete',
  path: '/api/llm/config',
  tags: ['LLM'],
  summary: '删除 LLM 配置',
  security: PROTECTED,
  responses: { 200: messageResponse('配置已删除') },
});

// POST /api/llm/test-connection
registry.registerPath({
  method: 'post',
  path: '/api/llm/test-connection',
  tags: ['LLM'],
  summary: '测试 LLM 连接',
  security: PROTECTED,
  request: { body: { content: { 'application/json': { schema: testLLMConnectionSchema } } } },
  responses: { 200: messageResponse('连接成功'), 400: errorResponse },
});

// GET /api/llm/providers
registry.registerPath({
  method: 'get',
  path: '/api/llm/providers',
  tags: ['LLM'],
  summary: '获取 LLM 提供商列表',
  security: PROTECTED,
  responses: {
    200: successResponse(z.array(z.object({ id: z.string(), name: z.string() })), '提供商列表'),
  },
});

// POST /api/llm/models
registry.registerPath({
  method: 'post',
  path: '/api/llm/models',
  tags: ['LLM'],
  summary: '获取模型列表',
  security: PROTECTED,
  request: { body: { content: { 'application/json': { schema: fetchModelsSchema } } } },
  responses: {
    200: successResponse(z.array(z.object({ id: z.string(), name: z.string() })), '模型列表'),
    400: errorResponse,
  },
});
