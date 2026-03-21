import { z } from '@knowledge-agent/shared/schemas';
import type { ApiRouteModuleId } from '../../../api-route-modules';
import { PROTECTED } from '../registry';
import {
  defineOpenApiOperations,
  type OpenApiOperationMap,
  type OpenApiRouteModuleMetadata,
} from '../route-metadata';
import { authOpenApiOperations } from './auth.paths';
import { chatOpenApiOperations } from './chat.paths';
import { documentAiOpenApiOperations } from './document-ai.paths';
import { documentOpenApiOperations } from './document.paths';
import { emailOpenApiOperations } from './email.paths';
import { knowledgeBaseOpenApiOperations } from './knowledge-base.paths';
import { llmOpenApiOperations } from './llm.paths';
import { logsOpenApiOperations } from './logs.paths';
import { oauthOpenApiOperations } from './oauth.paths';
import { ragOpenApiOperations } from './rag.paths';
import { storageOpenApiOperations } from './storage.paths';
import { userOpenApiOperations } from './user.paths';

function createModuleMetadata(
  defaultTags: string[],
  operations: OpenApiOperationMap,
  defaultSecurity?: OpenApiRouteModuleMetadata['defaultSecurity']
): OpenApiRouteModuleMetadata {
  return {
    defaultTags,
    defaultSecurity,
    operations,
  };
}

export const openApiRouteModules: Record<ApiRouteModuleId, OpenApiRouteModuleMetadata> = {
  storage: createModuleMetadata(['Storage'], storageOpenApiOperations),
  auth: createModuleMetadata(['Auth'], authOpenApiOperations),
  email: createModuleMetadata(['Email Verification'], emailOpenApiOperations),
  oauth: createModuleMetadata(['OAuth'], oauthOpenApiOperations),
  user: createModuleMetadata(['User'], userOpenApiOperations, PROTECTED),
  document: createModuleMetadata(['Document'], documentOpenApiOperations, PROTECTED),
  'knowledge-base': createModuleMetadata(
    ['Knowledge Base'],
    knowledgeBaseOpenApiOperations,
    PROTECTED
  ),
  logs: createModuleMetadata(['Logs'], logsOpenApiOperations, PROTECTED),
  rag: createModuleMetadata(['RAG'], ragOpenApiOperations, PROTECTED),
  llm: createModuleMetadata(['LLM'], llmOpenApiOperations, PROTECTED),
  chat: createModuleMetadata(['Chat'], chatOpenApiOperations, PROTECTED),
  'document-ai': createModuleMetadata(['Document AI'], documentAiOpenApiOperations, PROTECTED),
};

const readinessResponseSchema = z.object({
  status: z.enum(['ready', 'not_ready']),
  timestamp: z.string(),
  checks: z.record(
    z.string(),
    z.object({
      status: z.enum(['up', 'down']),
      required: z.boolean(),
      latencyMs: z.number(),
      error: z.string().optional(),
    })
  ),
});

export const standaloneOpenApiOperations = defineOpenApiOperations({
  'GET /health': {
    tags: ['System'],
    summary: 'Readiness health check',
    responses: {
      200: {
        description: 'Service is ready to receive traffic',
        content: {
          'application/json': {
            schema: readinessResponseSchema,
          },
        },
      },
      503: {
        description: 'Service is not ready to receive traffic',
        content: {
          'application/json': {
            schema: readinessResponseSchema,
          },
        },
      },
    },
  },
  'GET /health/live': {
    tags: ['System'],
    summary: 'Liveness health check',
    responses: {
      200: {
        description: 'Process is alive',
        content: {
          'application/json': {
            schema: z.object({
              status: z.literal('alive'),
              timestamp: z.string(),
              uptimeSeconds: z.number(),
            }),
          },
        },
      },
    },
  },
  'GET /health/ready': {
    tags: ['System'],
    summary: 'Readiness health check',
    responses: {
      200: {
        description: 'Service is ready to receive traffic',
        content: {
          'application/json': {
            schema: readinessResponseSchema,
          },
        },
      },
      503: {
        description: 'Service is not ready to receive traffic',
        content: {
          'application/json': {
            schema: readinessResponseSchema,
          },
        },
      },
    },
  },
  'GET /api/hello': {
    tags: ['System'],
    summary: 'Legacy hello endpoint',
    responses: {
      200: {
        description: 'Legacy health endpoint response',
        content: {
          'application/json': {
            schema: z.object({ message: z.string() }),
          },
        },
      },
    },
  },
});
