import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from '@knowledge-agent/shared/schemas';

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// ==================== Bearer Auth ====================

export const bearerAuth = registry.registerComponent('securitySchemes', 'BearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

// ==================== Response Helpers ====================

export function successResponse<T extends z.ZodTypeAny>(dataSchema: T, description: string) {
  return {
    description,
    content: {
      'application/json': {
        schema: z.object({ success: z.literal(true), data: dataSchema }),
      },
    },
  };
}

export function paginatedResponse<T extends z.ZodTypeAny>(itemSchema: T, description: string) {
  return {
    description,
    content: {
      'application/json': {
        schema: z.object({
          success: z.literal(true),
          data: z.array(itemSchema),
          pagination: z.object({
            page: z.number(),
            pageSize: z.number(),
            total: z.number(),
            totalPages: z.number(),
          }),
        }),
      },
    },
  };
}

export function messageResponse(description: string) {
  return {
    description,
    content: {
      'application/json': {
        schema: z.object({
          success: z.literal(true),
          data: z.object({ message: z.string() }),
        }),
      },
    },
  };
}

export const errorResponse = {
  description: 'Error response',
  content: {
    'application/json': {
      schema: z.object({
        success: z.literal(false),
        error: z.object({
          code: z.string(),
          message: z.string(),
          requestId: z.string().optional(),
        }),
      }),
    },
  },
};

export const PROTECTED = [{ BearerAuth: [] }];

// ==================== Document Generator ====================

export function generateDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'Knowledge Agent API',
      version: '1.0.0',
      description: 'Knowledge Agent 后端 API 文档',
    },
    servers: [{ url: '/', description: 'Current server' }],
  });
}
