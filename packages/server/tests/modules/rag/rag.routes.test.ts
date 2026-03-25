import { describe, expect, it, vi } from 'vitest';

const {
  mockRouter,
  RouterMock,
  authenticateMock,
  aiRateLimiterMock,
  validateBodyMock,
  requireKnowledgeBaseOwnershipMock,
  requireDocumentOwnershipMock,
  ragControllerMock,
  ragSearchRequestSchemaMock,
  ragSearchValidatorMock,
  knowledgeBaseOwnershipMiddlewareMock,
  documentOwnershipMiddlewareMock,
} = vi.hoisted(() => {
  const hoistedRouter = {
    use: vi.fn(),
    post: vi.fn(),
    get: vi.fn(),
  };
  const ragSearchValidator = vi.fn();
  const knowledgeBaseOwnershipMiddleware = vi.fn();
  const documentOwnershipMiddleware = vi.fn();

  return {
    mockRouter: hoistedRouter,
    RouterMock: vi.fn(() => hoistedRouter),
    authenticateMock: vi.fn(),
    aiRateLimiterMock: vi.fn(),
    validateBodyMock: vi.fn(() => ragSearchValidator),
    requireKnowledgeBaseOwnershipMock: vi.fn(() => knowledgeBaseOwnershipMiddleware),
    requireDocumentOwnershipMock: vi.fn(() => documentOwnershipMiddleware),
    ragControllerMock: {
      search: vi.fn(),
      processDocument: vi.fn(),
      getStatus: vi.fn(),
    },
    ragSearchRequestSchemaMock: { type: 'rag-search-schema' },
    ragSearchValidatorMock: ragSearchValidator,
    knowledgeBaseOwnershipMiddlewareMock: knowledgeBaseOwnershipMiddleware,
    documentOwnershipMiddlewareMock: documentOwnershipMiddleware,
  };
});

vi.mock('express', () => ({
  Router: RouterMock,
}));

vi.mock('@core/middleware', () => ({
  authenticate: authenticateMock,
  aiRateLimiter: aiRateLimiterMock,
  validateBody: validateBodyMock,
  getValidatedBody: vi.fn(),
}));

vi.mock('@modules/rag/controllers/rag.controller', () => ({
  ragController: ragControllerMock,
}));

vi.mock('@modules/document/public/ownership', () => ({
  requireDocumentOwnership: requireDocumentOwnershipMock,
}));

vi.mock('@modules/knowledge-base/public/ownership', () => ({
  requireKnowledgeBaseOwnership: requireKnowledgeBaseOwnershipMock,
}));

vi.mock('@groundpath/shared/schemas', () => ({
  ragSearchRequestSchema: ragSearchRequestSchemaMock,
}));

import ragRoutes from '@modules/rag/rag.routes';

describe('rag.routes', () => {
  it('should create router once and export it', () => {
    expect(RouterMock).toHaveBeenCalledTimes(1);
    expect(ragRoutes).toBe(mockRouter);
  });

  it('should register auth middleware', () => {
    expect(mockRouter.use).toHaveBeenCalledWith(authenticateMock);
  });

  it('should register rag endpoints', () => {
    expect(validateBodyMock).toHaveBeenCalledWith(ragSearchRequestSchemaMock);
    expect(requireKnowledgeBaseOwnershipMock).toHaveBeenCalledTimes(1);
    expect(requireDocumentOwnershipMock).toHaveBeenCalledTimes(2);

    expect(mockRouter.post).toHaveBeenCalledWith(
      '/search',
      aiRateLimiterMock,
      ragSearchValidatorMock,
      knowledgeBaseOwnershipMiddlewareMock,
      ragControllerMock.search
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/process/:documentId',
      aiRateLimiterMock,
      documentOwnershipMiddlewareMock,
      ragControllerMock.processDocument
    );
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/status/:documentId',
      documentOwnershipMiddlewareMock,
      ragControllerMock.getStatus
    );
  });
});
