import { describe, expect, it, vi } from 'vitest';

const {
  mockRouter,
  RouterMock,
  authenticateMock,
  validateBodyMock,
  llmConfigControllerMock,
  updateLLMConfigSchemaMock,
  testLLMConnectionSchemaMock,
  fetchModelsSchemaMock,
  updateConfigValidatorMock,
  testConnectionValidatorMock,
  fetchModelsValidatorMock,
} = vi.hoisted(() => {
  const hoistedRouter = {
    use: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    post: vi.fn(),
  };

  const updateLLMConfigSchema = { type: 'update-llm-config-schema' };
  const testLLMConnectionSchema = { type: 'test-llm-connection-schema' };
  const fetchModelsSchema = { type: 'fetch-models-schema' };

  const updateConfigValidator = vi.fn();
  const testConnectionValidator = vi.fn();
  const fetchModelsValidator = vi.fn();

  return {
    mockRouter: hoistedRouter,
    RouterMock: vi.fn(() => hoistedRouter),
    authenticateMock: vi.fn(),
    validateBodyMock: vi.fn((schema: unknown) => {
      if (schema === updateLLMConfigSchema) return updateConfigValidator;
      if (schema === testLLMConnectionSchema) return testConnectionValidator;
      if (schema === fetchModelsSchema) return fetchModelsValidator;
      return vi.fn();
    }),
    llmConfigControllerMock: {
      getConfig: vi.fn(),
      updateConfig: vi.fn(),
      deleteConfig: vi.fn(),
      testConnection: vi.fn(),
      getProviders: vi.fn(),
      fetchModels: vi.fn(),
    },
    updateLLMConfigSchemaMock: updateLLMConfigSchema,
    testLLMConnectionSchemaMock: testLLMConnectionSchema,
    fetchModelsSchemaMock: fetchModelsSchema,
    updateConfigValidatorMock: updateConfigValidator,
    testConnectionValidatorMock: testConnectionValidator,
    fetchModelsValidatorMock: fetchModelsValidator,
  };
});

vi.mock('express', () => ({
  Router: RouterMock,
}));

vi.mock('@core/middleware', () => ({
  authenticate: authenticateMock,
  validateBody: validateBodyMock,
}));

vi.mock('@modules/llm/controllers/llm-config.controller', () => ({
  llmConfigController: llmConfigControllerMock,
}));

vi.mock('@groundpath/shared/schemas', () => ({
  updateLLMConfigSchema: updateLLMConfigSchemaMock,
  testLLMConnectionSchema: testLLMConnectionSchemaMock,
  fetchModelsSchema: fetchModelsSchemaMock,
}));

import llmRoutes from '@modules/llm/llm.routes';

describe('llm.routes', () => {
  it('should create router once and export it', () => {
    expect(RouterMock).toHaveBeenCalledTimes(1);
    expect(llmRoutes).toBe(mockRouter);
  });

  it('should register authentication middleware first', () => {
    expect(mockRouter.use).toHaveBeenCalledWith(authenticateMock);
  });

  it('should register all llm config endpoints with validators', () => {
    expect(validateBodyMock).toHaveBeenCalledWith(updateLLMConfigSchemaMock);
    expect(validateBodyMock).toHaveBeenCalledWith(testLLMConnectionSchemaMock);
    expect(validateBodyMock).toHaveBeenCalledWith(fetchModelsSchemaMock);

    expect(mockRouter.get).toHaveBeenCalledWith('/config', llmConfigControllerMock.getConfig);
    expect(mockRouter.put).toHaveBeenCalledWith(
      '/config',
      updateConfigValidatorMock,
      llmConfigControllerMock.updateConfig
    );
    expect(mockRouter.delete).toHaveBeenCalledWith('/config', llmConfigControllerMock.deleteConfig);
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/test-connection',
      testConnectionValidatorMock,
      llmConfigControllerMock.testConnection
    );
    expect(mockRouter.get).toHaveBeenCalledWith('/providers', llmConfigControllerMock.getProviders);
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/models',
      fetchModelsValidatorMock,
      llmConfigControllerMock.fetchModels
    );
  });
});
