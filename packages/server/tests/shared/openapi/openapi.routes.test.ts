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
});
