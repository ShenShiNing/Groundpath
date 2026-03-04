import { describe, expect, it, vi } from 'vitest';

const { mockRouter, RouterMock, authenticateMock, ragControllerMock } = vi.hoisted(() => {
  const hoistedRouter = {
    use: vi.fn(),
    post: vi.fn(),
    get: vi.fn(),
  };

  return {
    mockRouter: hoistedRouter,
    RouterMock: vi.fn(() => hoistedRouter),
    authenticateMock: vi.fn(),
    ragControllerMock: {
      search: vi.fn(),
      processDocument: vi.fn(),
      getStatus: vi.fn(),
    },
  };
});

vi.mock('express', () => ({
  Router: RouterMock,
}));

vi.mock('@shared/middleware', () => ({
  authenticate: authenticateMock,
}));

vi.mock('@modules/rag/controllers/rag.controller', () => ({
  ragController: ragControllerMock,
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
    expect(mockRouter.post).toHaveBeenCalledWith('/search', ragControllerMock.search);
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/process/:documentId',
      ragControllerMock.processDocument
    );
    expect(mockRouter.get).toHaveBeenCalledWith('/status/:documentId', ragControllerMock.getStatus);
  });
});
