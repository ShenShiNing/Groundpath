import { describe, expect, it, vi } from 'vitest';

const {
  mockRouter,
  RouterMock,
  authenticateMock,
  validateBodyMock,
  summaryRequestSchemaMock,
  analysisRequestSchemaMock,
  generateRequestSchemaMock,
  expandRequestSchemaMock,
  summaryValidatorMock,
  analysisValidatorMock,
  generateValidatorMock,
  expandValidatorMock,
  summaryControllerMock,
  analysisControllerMock,
  generationControllerMock,
} = vi.hoisted(() => {
  const hoistedRouter = {
    use: vi.fn(),
    post: vi.fn(),
    get: vi.fn(),
  };

  const summaryRequestSchema = { type: 'summary-schema' };
  const analysisRequestSchema = { type: 'analysis-schema' };
  const generateRequestSchema = { type: 'generate-schema' };
  const expandRequestSchema = { type: 'expand-schema' };

  const summaryValidator = vi.fn();
  const analysisValidator = vi.fn();
  const generateValidator = vi.fn();
  const expandValidator = vi.fn();

  return {
    mockRouter: hoistedRouter,
    RouterMock: vi.fn(() => hoistedRouter),
    authenticateMock: vi.fn(),
    validateBodyMock: vi.fn((schema: unknown) => {
      if (schema === summaryRequestSchema) return summaryValidator;
      if (schema === analysisRequestSchema) return analysisValidator;
      if (schema === generateRequestSchema) return generateValidator;
      if (schema === expandRequestSchema) return expandValidator;
      return vi.fn();
    }),
    summaryRequestSchemaMock: summaryRequestSchema,
    analysisRequestSchemaMock: analysisRequestSchema,
    generateRequestSchemaMock: generateRequestSchema,
    expandRequestSchemaMock: expandRequestSchema,
    summaryValidatorMock: summaryValidator,
    analysisValidatorMock: analysisValidator,
    generateValidatorMock: generateValidator,
    expandValidatorMock: expandValidator,
    summaryControllerMock: {
      generate: vi.fn(),
      stream: vi.fn(),
    },
    analysisControllerMock: {
      analyze: vi.fn(),
      extractKeywords: vi.fn(),
      extractEntities: vi.fn(),
      getStructure: vi.fn(),
    },
    generationControllerMock: {
      generate: vi.fn(),
      streamGenerate: vi.fn(),
      expand: vi.fn(),
      streamExpand: vi.fn(),
    },
  };
});

vi.mock('express', () => ({
  Router: RouterMock,
}));

vi.mock('@core/middleware', () => ({
  authenticate: authenticateMock,
  validateBody: validateBodyMock,
  aiRateLimiter: vi.fn(),
}));

vi.mock('@knowledge-agent/shared/schemas', () => ({
  summaryRequestSchema: summaryRequestSchemaMock,
  analysisRequestSchema: analysisRequestSchemaMock,
  generateRequestSchema: generateRequestSchemaMock,
  expandRequestSchema: expandRequestSchemaMock,
}));

vi.mock('@modules/document-ai/controllers/summary.controller', () => ({
  summaryController: summaryControllerMock,
}));

vi.mock('@modules/document-ai/controllers/analysis.controller', () => ({
  analysisController: analysisControllerMock,
}));

vi.mock('@modules/document-ai/controllers/generation.controller', () => ({
  generationController: generationControllerMock,
}));

import documentAiRoutes from '@modules/document-ai/document-ai.routes';

describe('document-ai.routes', () => {
  it('should create router once and export it', () => {
    expect(RouterMock).toHaveBeenCalledTimes(1);
    expect(documentAiRoutes).toBe(mockRouter);
  });

  it('should register auth middleware', () => {
    expect(mockRouter.use).toHaveBeenCalledWith(authenticateMock);
  });

  it('should register summary endpoints', () => {
    expect(validateBodyMock).toHaveBeenCalledWith(summaryRequestSchemaMock);
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/:id/summary',
      expect.any(Function),
      summaryValidatorMock,
      summaryControllerMock.generate
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/:id/summary/stream',
      expect.any(Function),
      summaryValidatorMock,
      summaryControllerMock.stream
    );
  });

  it('should register analysis endpoints', () => {
    expect(validateBodyMock).toHaveBeenCalledWith(analysisRequestSchemaMock);
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/:id/analyze',
      expect.any(Function),
      analysisValidatorMock,
      analysisControllerMock.analyze
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/:id/analyze/keywords',
      expect.any(Function),
      analysisControllerMock.extractKeywords
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/:id/analyze/entities',
      expect.any(Function),
      analysisControllerMock.extractEntities
    );
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/:id/analyze/structure',
      analysisControllerMock.getStructure
    );
  });

  it('should register generation endpoints', () => {
    expect(validateBodyMock).toHaveBeenCalledWith(generateRequestSchemaMock);
    expect(validateBodyMock).toHaveBeenCalledWith(expandRequestSchemaMock);

    expect(mockRouter.post).toHaveBeenCalledWith(
      '/generate',
      expect.any(Function),
      generateValidatorMock,
      generationControllerMock.generate
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/generate/stream',
      expect.any(Function),
      generateValidatorMock,
      generationControllerMock.streamGenerate
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/:id/expand',
      expect.any(Function),
      expandValidatorMock,
      generationControllerMock.expand
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/:id/expand/stream',
      expect.any(Function),
      expandValidatorMock,
      generationControllerMock.streamExpand
    );
  });
});
