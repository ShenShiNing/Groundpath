import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '@core/openapi';
import { standaloneOpenApiOperations } from '@core/openapi/paths';
import { discoverApiRoutes, normalizeExpressPathToOpenApi } from '@core/openapi/route-discovery';
import { type HttpMethod, toOpenApiOperationKey } from '@core/openapi/route-metadata';

const HTTP_METHODS: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete'];

type OpenApiSchema = {
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  anyOf?: OpenApiSchema[];
  enum?: string[];
  required?: string[];
  format?: string;
};

type OpenApiParameter = {
  name?: string;
  in?: string;
  required?: boolean;
  schema?: OpenApiSchema;
};

function asSchema(value: unknown): OpenApiSchema | undefined {
  return value && typeof value === 'object' ? (value as OpenApiSchema) : undefined;
}

function getResponseSchema(
  path: string,
  method: HttpMethod,
  statusCode: number | string
): OpenApiSchema | undefined {
  const document = buildOpenApiDocument();
  return asSchema(
    document.paths[path]?.[method]?.responses?.[String(statusCode)]?.content?.['application/json']
      ?.schema
  );
}

function getRequestBodySchema(
  path: string,
  method: HttpMethod,
  mediaType: string = 'application/json'
): OpenApiSchema | undefined {
  const document = buildOpenApiDocument();
  return asSchema(document.paths[path]?.[method]?.requestBody?.content?.[mediaType]?.schema);
}

function getOperationParameters(path: string, method: HttpMethod): OpenApiParameter[] {
  const document = buildOpenApiDocument();
  const parameters = document.paths[path]?.[method]?.parameters;
  return Array.isArray(parameters) ? (parameters as OpenApiParameter[]) : [];
}

function getProperty(schema: OpenApiSchema | undefined, key: string): OpenApiSchema | undefined {
  return asSchema(schema?.properties?.[key]);
}

function getItems(schema: OpenApiSchema | undefined): OpenApiSchema | undefined {
  return asSchema(schema?.items);
}

function getQueryParameter(
  path: string,
  method: HttpMethod,
  name: string
): OpenApiParameter | undefined {
  return getOperationParameters(path, method).find(
    (parameter) => parameter.in === 'query' && parameter.name === name
  );
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

  it('describes structured rag summary and report responses with concrete schemas', () => {
    const summarySchema = getResponseSchema('/api/logs/structured-rag/summary', 'get', 200);
    const summaryData = getProperty(summarySchema, 'data');
    expect(getProperty(getProperty(summaryData, 'agent'), 'fallbackRatio')).toBeDefined();
    expect(
      getProperty(getItems(getProperty(summaryData, 'recentEvents')), 'metadata')
    ).toBeDefined();

    const reportSchema = getResponseSchema('/api/logs/structured-rag/report', 'get', 200);
    const reportData = getProperty(reportSchema, 'data');
    expect(getProperty(getProperty(reportData, 'summary'), 'index')).toBeDefined();
    expect(getProperty(reportData, 'markdown')).toBeDefined();
  });

  it('keeps document ai analyze contracts aligned with validated request bodies', () => {
    const analyzeSchema = getResponseSchema('/api/document-ai/{id}/analyze', 'post', 200);
    const analyzeData = getProperty(analyzeSchema, 'data');
    expect(getProperty(getItems(getProperty(analyzeData, 'keywords')), 'relevance')).toBeDefined();
    expect(getProperty(getItems(getProperty(analyzeData, 'entities')), 'type')?.enum).toContain(
      'organization'
    );
    expect(
      getProperty(getProperty(analyzeData, 'structure'), 'estimatedReadingTimeMinutes')
    ).toBeDefined();

    const keywordsRequestSchema = getRequestBodySchema(
      '/api/document-ai/{id}/analyze/keywords',
      'post'
    );
    expect(getProperty(keywordsRequestSchema, 'maxKeywords')).toBeDefined();
    expect(getProperty(keywordsRequestSchema, 'language')).toBeDefined();

    const entitiesRequestSchema = getRequestBodySchema(
      '/api/document-ai/{id}/analyze/entities',
      'post'
    );
    expect(getProperty(entitiesRequestSchema, 'maxEntities')).toBeDefined();
    expect(getProperty(entitiesRequestSchema, 'language')).toBeDefined();

    const keywordsResponseSchema = getResponseSchema(
      '/api/document-ai/{id}/analyze/keywords',
      'post',
      200
    );
    const keywordsData = getProperty(keywordsResponseSchema, 'data');
    const keywordItem = getItems(getProperty(keywordsData, 'keywords'));
    expect(getProperty(keywordItem, 'word')).toBeDefined();
    expect(getProperty(keywordItem, 'relevance')).toBeDefined();

    const entitiesResponseSchema = getResponseSchema(
      '/api/document-ai/{id}/analyze/entities',
      'post',
      200
    );
    const entitiesData = getProperty(entitiesResponseSchema, 'data');
    const entityItem = getItems(getProperty(entitiesData, 'entities'));
    expect(getProperty(entityItem, 'text')).toBeDefined();
    expect(getProperty(entityItem, 'confidence')).toBeDefined();
    expect(getProperty(entityItem, 'type')?.enum).toContain('organization');
  });

  it('keeps knowledge base and document contracts aligned with live API payloads', () => {
    const knowledgeBaseListSchema = getResponseSchema('/api/knowledge-bases', 'get', 200);
    const knowledgeBaseListData = getProperty(knowledgeBaseListSchema, 'data');
    const knowledgeBases = getProperty(knowledgeBaseListData, 'knowledgeBases');
    expect(getProperty(getItems(knowledgeBases), 'embeddingModel')).toBeDefined();
    expect(getProperty(getItems(knowledgeBases), 'totalChunks')).toBeDefined();
    expect(getProperty(knowledgeBaseListData, 'pagination')).toBeDefined();

    const knowledgeBaseDocumentsSchema = getResponseSchema(
      '/api/knowledge-bases/{id}/documents',
      'get',
      200
    );
    const knowledgeBaseDocumentsData = getProperty(knowledgeBaseDocumentsSchema, 'data');
    expect(getProperty(knowledgeBaseDocumentsData, 'documents')).toBeDefined();
    expect(getProperty(knowledgeBaseDocumentsData, 'pagination')).toBeDefined();
    expect(getQueryParameter('/api/knowledge-bases/{id}/documents', 'get', 'page')?.required).toBe(
      false
    );
    expect(
      getQueryParameter('/api/knowledge-bases/{id}/documents', 'get', 'knowledgeBaseId')
    ).toBeUndefined();

    const knowledgeBaseDocumentUploadSchema = getRequestBodySchema(
      '/api/knowledge-bases/{id}/documents',
      'post',
      'multipart/form-data'
    );
    expect(getProperty(knowledgeBaseDocumentUploadSchema, 'file')?.format).toBe('binary');
    expect(getProperty(knowledgeBaseDocumentUploadSchema, 'title')).toBeDefined();
    expect(getProperty(knowledgeBaseDocumentUploadSchema, 'description')).toBeDefined();
    expect(knowledgeBaseDocumentUploadSchema?.required).toContain('file');

    const knowledgeBaseDocumentUploadResponse = getResponseSchema(
      '/api/knowledge-bases/{id}/documents',
      'post',
      201
    );
    const knowledgeBaseDocumentUploadData = getProperty(
      knowledgeBaseDocumentUploadResponse,
      'data'
    );
    expect(getProperty(knowledgeBaseDocumentUploadData, 'message')).toBeDefined();
    expect(
      getProperty(getProperty(knowledgeBaseDocumentUploadData, 'document'), 'fileName')
    ).toBeDefined();

    const documentUploadSchema = getRequestBodySchema(
      '/api/documents',
      'post',
      'multipart/form-data'
    );
    expect(getProperty(documentUploadSchema, 'knowledgeBaseId')).toBeDefined();
    expect(getProperty(documentUploadSchema, 'title')).toBeDefined();
    expect(getProperty(documentUploadSchema, 'description')).toBeDefined();
    expect(documentUploadSchema?.required).toEqual(
      expect.arrayContaining(['file', 'knowledgeBaseId'])
    );

    const documentUploadResponse = getResponseSchema('/api/documents', 'post', 201);
    const documentUploadData = getProperty(documentUploadResponse, 'data');
    expect(getProperty(documentUploadData, 'message')).toBeDefined();
    expect(
      getProperty(getProperty(documentUploadData, 'document'), 'currentVersion')
    ).toBeDefined();

    const versionListSchema = getResponseSchema('/api/documents/{id}/versions', 'get', 200);
    const versionListData = getProperty(versionListSchema, 'data');
    const versions = getProperty(versionListData, 'versions');
    expect(getProperty(getItems(versions), 'version')).toBeDefined();
    expect(getProperty(getItems(versions), 'versionNumber')).toBeUndefined();
    expect(getProperty(versionListData, 'currentVersion')).toBeDefined();

    const versionUploadSchema = getRequestBodySchema(
      '/api/documents/{id}/versions',
      'post',
      'multipart/form-data'
    );
    expect(getProperty(versionUploadSchema, 'changeNote')).toBeDefined();

    const saveContentSchema = getResponseSchema('/api/documents/{id}/content', 'put', 200);
    const saveContentData = getProperty(saveContentSchema, 'data');
    expect(getProperty(saveContentData, 'message')).toBeDefined();
    expect(getProperty(getProperty(saveContentData, 'document'), 'processingStatus')).toBeDefined();

    const clearTrashSchema = getResponseSchema('/api/documents/trash', 'delete', 200);
    const clearTrashData = getProperty(clearTrashSchema, 'data');
    expect(getProperty(clearTrashData, 'deletedCount')).toBeDefined();
    expect(getProperty(clearTrashData, 'failedCount')).toBeDefined();
  });
});
