import { z } from '@groundpath/shared/schemas';
import {
  loginLogQuerySchema,
  operationLogQuerySchema,
  resourceHistorySchema,
  structuredRagDashboardSummarySchema,
  structuredRagDashboardQuerySchema,
  structuredRagLongTermReportSchema,
  structuredRagReportQuerySchema,
  structuredRagDashboardSummarySchema,
  structuredRagLongTermReportSchema,
} from '@groundpath/shared/schemas';
import { paginatedResponse, successResponse } from '../registry';
import { defineOpenApiOperations } from '../route-metadata';

export const logsOpenApiOperations = defineOpenApiOperations({
  'GET /api/logs/login': {
    summary: '列出登录历史',
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
  },
  'GET /api/logs/login/recent': {
    summary: '获取最近登录历史',
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
  },
  'GET /api/logs/structured-rag/summary': {
    summary: 'RAG 仪表板摘要',
    request: { query: structuredRagDashboardQuerySchema },
    responses: { 200: successResponse(structuredRagDashboardSummarySchema, 'RAG 摘要数据') },
  },
  'GET /api/logs/structured-rag/report': {
    summary: 'RAG 报告',
    request: { query: structuredRagReportQuerySchema },
    responses: { 200: successResponse(structuredRagLongTermReportSchema, 'RAG 报告数据') },
  },
  'GET /api/logs/operations': {
    summary: '列出操作历史',
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
  },
  'GET /api/logs/operations/resource/{resourceType}/{resourceId}': {
    summary: '获取特定资源的操作历史',
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
  },
});
