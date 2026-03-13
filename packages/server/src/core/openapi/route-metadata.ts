import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type OpenApiPathDefinition = Parameters<OpenAPIRegistry['registerPath']>[0];
export type OpenApiOperationMetadata = Omit<OpenApiPathDefinition, 'method' | 'path'>;
export type OpenApiOperationMap = Readonly<Record<string, OpenApiOperationMetadata>>;

export interface OpenApiRouteModuleMetadata {
  defaultTags: string[];
  defaultSecurity?: OpenApiOperationMetadata['security'];
  operations: OpenApiOperationMap;
}

export interface DiscoveredApiRoute {
  method: HttpMethod;
  path: string;
}

export function defineOpenApiOperations<T extends OpenApiOperationMap>(
  operations: T
): OpenApiOperationMap {
  return operations;
}

export function toOpenApiOperationKey(method: HttpMethod, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}
