import { z } from '@knowledge-agent/shared/schemas';
import { registry, successResponse, paginatedResponse, PROTECTED } from '../registry';
import {
  loginLogQuerySchema,
  operationLogQuerySchema,
  resourceHistorySchema,
  structuredRagDashboardQuerySchema,
  structuredRagReportQuerySchema,
} from '@knowledge-agent/shared/schemas';

// GET /api/logs/login
registry.registerPath({
  method: 'get',
  path: '/api/logs/login',
  tags: ['Logs'],
  summary: '列出登录历史',
  security: PROTECTED,
  request: { query: loginLogQuerySchema },
  responses: {
    200: paginatedResponse(
      z.object({
        id: z.string(),
        authType: z.string(),
        success: z.boolean(),
        ipAddress: z.string().nullable(),
        createdAt: z.string(),
      }),
      '登录日志'
    ),
  },
});

// GET /api/logs/login/recent
registry.registerPath({
  method: 'get',
  path: '/api/logs/login/recent',
  tags: ['Logs'],
  summary: '获取最近登录历史',
  security: PROTECTED,
  responses: {
    200: successResponse(
      z.array(
        z.object({
          id: z.string(),
          authType: z.string(),
          success: z.boolean(),
          createdAt: z.string(),
        })
      ),
      '最近登录'
    ),
  },
});

// GET /api/logs/structured-rag/summary
registry.registerPath({
  method: 'get',
  path: '/api/logs/structured-rag/summary',
  tags: ['Logs'],
  summary: 'RAG 仪表板摘要',
  security: PROTECTED,
  request: { query: structuredRagDashboardQuerySchema },
  responses: { 200: successResponse(z.unknown(), 'RAG 摘要数据') },
});

// GET /api/logs/structured-rag/report
registry.registerPath({
  method: 'get',
  path: '/api/logs/structured-rag/report',
  tags: ['Logs'],
  summary: 'RAG 报告',
  security: PROTECTED,
  request: { query: structuredRagReportQuerySchema },
  responses: { 200: successResponse(z.unknown(), 'RAG 报告数据') },
});

// GET /api/logs/operations
registry.registerPath({
  method: 'get',
  path: '/api/logs/operations',
  tags: ['Logs'],
  summary: '列出操作历史',
  security: PROTECTED,
  request: { query: operationLogQuerySchema },
  responses: {
    200: paginatedResponse(
      z.object({
        id: z.string(),
        action: z.string(),
        resourceType: z.string(),
        createdAt: z.string(),
      }),
      '操作日志'
    ),
  },
});

// GET /api/logs/operations/resource/{resourceType}/{resourceId}
registry.registerPath({
  method: 'get',
  path: '/api/logs/operations/resource/{resourceType}/{resourceId}',
  tags: ['Logs'],
  summary: '获取特定资源的操作历史',
  security: PROTECTED,
  request: {
    params: z.object({ resourceType: z.string(), resourceId: z.string() }),
    query: resourceHistorySchema,
  },
  responses: {
    200: successResponse(
      z.array(z.object({ id: z.string(), action: z.string(), createdAt: z.string() })),
      '资源操作历史'
    ),
  },
});
