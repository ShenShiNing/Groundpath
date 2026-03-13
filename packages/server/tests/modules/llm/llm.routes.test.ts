import { describe, expect, it, vi } from 'vitest';

const { mockRouter, RouterMock, authenticateMock, llmConfigControllerMock } = vi.hoisted(() => {
  const hoistedRouter = {
    use: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    post: vi.fn(),
  };

  return {
    mockRouter: hoistedRouter,
    RouterMock: vi.fn(() => hoistedRouter),
    authenticateMock: vi.fn(),
    llmConfigControllerMock: {
      getConfig: vi.fn(),
      updateConfig: vi.fn(),
      deleteConfig: vi.fn(),
      testConnection: vi.fn(),
      getProviders: vi.fn(),
      fetchModels: vi.fn(),
    },
  };
});

vi.mock('express', () => ({
  Router: RouterMock,
}));

vi.mock('@core/middleware', () => ({
  authenticate: authenticateMock,
}));

vi.mock('@modules/llm/controllers/llm-config.controller', () => ({
  llmConfigController: llmConfigControllerMock,
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

  it('should register all llm config endpoints', () => {
    expect(mockRouter.get).toHaveBeenCalledWith('/config', llmConfigControllerMock.getConfig);
    expect(mockRouter.put).toHaveBeenCalledWith('/config', llmConfigControllerMock.updateConfig);
    expect(mockRouter.delete).toHaveBeenCalledWith('/config', llmConfigControllerMock.deleteConfig);
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/test-connection',
      llmConfigControllerMock.testConnection
    );
    expect(mockRouter.get).toHaveBeenCalledWith('/providers', llmConfigControllerMock.getProviders);
    expect(mockRouter.post).toHaveBeenCalledWith('/models', llmConfigControllerMock.fetchModels);
  });
});
