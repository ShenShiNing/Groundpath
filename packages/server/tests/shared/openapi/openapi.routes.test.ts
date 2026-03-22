import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '@core/openapi';
import { standaloneOpenApiOperations } from '@core/openapi/paths';
import { discoverApiRoutes, normalizeExpressPathToOpenApi } from '@core/openapi/route-discovery';
import { type HttpMethod, toOpenApiOperationKey } from '@core/openapi/route-metadata';

const HTTP_METHODS: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete'];

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

  it('describes structured rag summary and report responses with concrete schemas', () => {
    const document = buildOpenApiDocument();
    const summaryDataSchema = (
      document.paths['/api/logs/structured-rag/summary']?.get?.responses?.['200'] as {
        content?: { 'application/json'?: { schema?: { properties?: { data?: unknown } } } };
      }
    )?.content?.['application/json']?.schema?.properties?.data as
      | { properties?: Record<string, unknown> }
      | undefined;
    const reportDataSchema = (
      document.paths['/api/logs/structured-rag/report']?.get?.responses?.['200'] as {
        content?: { 'application/json'?: { schema?: { properties?: { data?: unknown } } } };
      }
    )?.content?.['application/json']?.schema?.properties?.data as
      | { properties?: Record<string, unknown> }
      | undefined;

    expect(summaryDataSchema?.properties).toMatchObject({
      agent: expect.any(Object),
      index: expect.any(Object),
      alerts: expect.any(Object),
      trend: expect.any(Object),
      recentEvents: expect.any(Object),
    });
    expect(reportDataSchema?.properties).toMatchObject({
      generatedAt: expect.any(Object),
      highlights: expect.any(Object),
      summary: expect.any(Object),
      markdown: expect.any(Object),
    });
  });
});
