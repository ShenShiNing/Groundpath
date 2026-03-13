import type { Router } from 'express';
import { apiRouteModules } from '../../api-route-modules';
import { registry } from './registry';
import {
  type DiscoveredApiRoute,
  type HttpMethod,
  type OpenApiOperationMap,
  toOpenApiOperationKey,
} from './route-metadata';
import { openApiRouteModules, standaloneOpenApiOperations } from './paths';

interface RouterLayer {
  route?: {
    path: string | string[];
    methods: Partial<Record<HttpMethod, boolean>>;
  };
  handle?: {
    stack?: RouterLayer[];
  };
}

const DEFAULT_RESPONSES: Record<string, { description: string }> = {
  200: { description: 'Success' },
};

let openApiRoutesRegistered = false;

export function normalizeExpressPathToOpenApi(path: string): string {
  return path.replace(/\{\*([A-Za-z0-9_]+)\}/g, '{$1}').replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

export function joinOpenApiPaths(basePath: string, routePath: string): string {
  const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const normalizedRoute =
    routePath === '/' ? '' : routePath.startsWith('/') ? routePath : `/${routePath}`;

  const fullPath = `${normalizedBase}${normalizedRoute}` || '/';
  return normalizeExpressPathToOpenApi(fullPath).replace(/\/+/g, '/');
}

export function discoverRouterRoutes(router: Router, basePath: string): DiscoveredApiRoute[] {
  const stack = ((router as unknown as { stack?: RouterLayer[] }).stack ?? []) as RouterLayer[];
  return stack.flatMap((layer) => discoverLayerRoutes(layer, basePath));
}

export function discoverApiRoutes(): DiscoveredApiRoute[] {
  return apiRouteModules.flatMap((routeModule) =>
    discoverRouterRoutes(routeModule.router, routeModule.basePath)
  );
}

export function ensureOpenApiRoutesRegistered(): void {
  if (openApiRoutesRegistered) {
    return;
  }

  for (const routeModule of apiRouteModules) {
    const moduleMetadata = openApiRouteModules[routeModule.id];
    const discoveredRoutes = discoverRouterRoutes(routeModule.router, routeModule.basePath);
    const moduleOperationKeys = new Set<string>();

    for (const route of discoveredRoutes) {
      const operationKey = toOpenApiOperationKey(route.method, route.path);
      const metadata = moduleMetadata.operations[operationKey];
      moduleOperationKeys.add(operationKey);

      registry.registerPath({
        method: route.method,
        path: route.path,
        tags: metadata?.tags ?? moduleMetadata.defaultTags,
        security: metadata?.security ?? moduleMetadata.defaultSecurity,
        summary: metadata?.summary,
        description: metadata?.description,
        operationId: metadata?.operationId,
        request: metadata?.request,
        responses: metadata?.responses ?? DEFAULT_RESPONSES,
      });
    }

    assertNoOrphanedOperations(routeModule.id, moduleMetadata.operations, moduleOperationKeys);
  }

  for (const [operationKey, metadata] of Object.entries(standaloneOpenApiOperations)) {
    const route = parseOperationKey(operationKey);
    registry.registerPath({
      method: route.method,
      path: route.path,
      tags: metadata.tags ?? ['System'],
      security: metadata.security,
      summary: metadata.summary,
      description: metadata.description,
      operationId: metadata.operationId,
      request: metadata.request,
      responses: metadata.responses ?? DEFAULT_RESPONSES,
    });
  }

  openApiRoutesRegistered = true;
}

function discoverLayerRoutes(layer: RouterLayer, basePath: string): DiscoveredApiRoute[] {
  if (layer.route) {
    return extractRouteDefinitions(layer.route, basePath);
  }

  if (layer.handle?.stack) {
    throw new Error(
      `Nested router mounts are not supported by OpenAPI auto-discovery under "${basePath}". ` +
        'Please mount child routers in src/api-route-modules.ts.'
    );
  }

  return [];
}

function extractRouteDefinitions(
  route: NonNullable<RouterLayer['route']>,
  basePath: string
): DiscoveredApiRoute[] {
  const routePaths = Array.isArray(route.path) ? route.path : [route.path];
  const methods = Object.entries(route.methods)
    .filter((entry): entry is [HttpMethod, boolean] => isHttpMethod(entry[0]) && entry[1] === true)
    .map(([method]) => method);

  return routePaths.flatMap((routePath) =>
    methods.map((method) => ({
      method,
      path: joinOpenApiPaths(basePath, routePath),
    }))
  );
}

function assertNoOrphanedOperations(
  moduleId: string,
  operations: OpenApiOperationMap,
  discoveredOperationKeys: Set<string>
): void {
  for (const operationKey of Object.keys(operations)) {
    if (!discoveredOperationKeys.has(operationKey)) {
      throw new Error(
        `OpenAPI metadata drift detected for module "${moduleId}": "${operationKey}" does not match any registered Express route.`
      );
    }
  }
}

function parseOperationKey(operationKey: string): DiscoveredApiRoute {
  const [method, ...pathParts] = operationKey.split(' ');

  if (!method) {
    throw new Error(`Unsupported OpenAPI operation key: "${operationKey}"`);
  }

  const path = pathParts.join(' ').trim();
  const normalizedMethod = method.toLowerCase();

  if (!isHttpMethod(normalizedMethod)) {
    throw new Error(`Unsupported OpenAPI operation key: "${operationKey}"`);
  }

  return {
    method: normalizedMethod,
    path,
  };
}

function isHttpMethod(value: string): value is HttpMethod {
  return ['get', 'post', 'put', 'patch', 'delete'].includes(value);
}
