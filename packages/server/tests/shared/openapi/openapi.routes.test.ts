import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '@core/openapi';
import { standaloneOpenApiOperations } from '@core/openapi/paths';
import { discoverApiRoutes, normalizeExpressPathToOpenApi } from '@core/openapi/route-discovery';
import { type HttpMethod, toOpenApiOperationKey } from '@core/openapi/route-metadata';

const HTTP_METHODS: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete'];

function getResponseSchema(
  path: string,
  method: HttpMethod,
  statusCode: number | string
): Record<string, any> {
  const document = buildOpenApiDocument();
  return document.paths[path]?.[method]?.responses?.[String(statusCode)]?.content?.[
    'application/json'
  ]?.schema as Record<string, any>;
}

describe('OpenAPI route auto-discovery', () => {
  it('keeps the generated OpenAPI document in sync with registered Express routes', () => {
    const document = buildOpenApiDocument();

    const expectedOperationKeys = [
      ...discoverApiRoutes().map((route) => toOpenApiOperationKey(route.method, route.path)),
      ...Object.keys(standaloneOpenApiOperations),
    ].sort();

    const actualOperationKeys = Object.entries(document.paths).flatMap(([path, pathItem]) =>
      HTTP_METHODS.filter((method) => pathItem?.[method]).map((method) =>
        toOpenApiOperationKey(method, path)
      )
    );

    expect(actualOperationKeys.sort()).toEqual(expectedOperationKeys);
  });

  it('normalizes Express wildcard paths into valid OpenAPI parameter syntax', () => {
    const document = buildOpenApiDocument();
    const normalizedPath = normalizeExpressPathToOpenApi('/api/files/{*key}');

    expect(normalizedPath).toBe('/api/files/{key}');
    expect(document.paths[normalizedPath]?.get).toBeDefined();
  });

  it('documents concrete structured RAG, document AI, and chat response payloads', () => {
    const ragSummarySchema = getResponseSchema('/api/logs/structured-rag/summary', 'get', 200);
    expect(
      ragSummarySchema.properties?.data?.properties?.agent?.properties?.fallbackRatio
    ).toBeDefined();
    expect(
      ragSummarySchema.properties?.data?.properties?.recentEvents?.items?.anyOf?.[0]?.properties
        ?.metadata?.properties?.toolCallCount
    ).toBeDefined();

    const ragReportSchema = getResponseSchema('/api/logs/structured-rag/report', 'get', 200);
    expect(ragReportSchema.properties?.data?.properties?.summary?.properties?.index).toBeDefined();
    expect(ragReportSchema.properties?.data?.properties?.markdown).toBeDefined();

    const analyzeSchema = getResponseSchema('/api/document-ai/{id}/analyze', 'post', 200);
    expect(
      analyzeSchema.properties?.data?.properties?.keywords?.items?.properties?.relevance
    ).toBeDefined();
    expect(
      analyzeSchema.properties?.data?.properties?.entities?.items?.properties?.type?.enum
    ).toContain('organization');
    expect(
      analyzeSchema.properties?.data?.properties?.structure?.properties?.estimatedReadingTimeMinutes
    ).toBeDefined();

    const chatListSchema = getResponseSchema('/api/chat/conversations', 'get', 200);
    expect(
      chatListSchema.properties?.data?.properties?.items?.items?.properties?.messageCount
    ).toBeDefined();
    expect(
      chatListSchema.properties?.data?.properties?.pagination?.properties?.hasMore
    ).toBeDefined();

    const chatDetailSchema = getResponseSchema('/api/chat/conversations/{id}', 'get', 200);
    expect(
      chatDetailSchema.properties?.data?.properties?.messages?.items?.properties?.conversationId
    ).toBeDefined();
    expect(
      chatDetailSchema.properties?.data?.properties?.messages?.items?.properties?.metadata
        ?.properties?.retrievedSources
    ).toBeDefined();
  });
});
