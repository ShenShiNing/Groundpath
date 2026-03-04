import { describe, expect, it, vi } from 'vitest';

const { mockRouter, RouterMock, storageControllerMock } = vi.hoisted(() => {
  const hoistedRouter = {
    get: vi.fn(),
  };

  return {
    mockRouter: hoistedRouter,
    RouterMock: vi.fn(() => hoistedRouter),
    storageControllerMock: {
      serveFile: vi.fn(),
    },
  };
});

vi.mock('express', () => ({
  default: { Router: RouterMock },
  Router: RouterMock,
}));

vi.mock('@modules/storage/storage.controller', () => ({
  storageController: storageControllerMock,
}));

import { storageRoutes } from '@modules/storage/storage.routes';

describe('storage.routes', () => {
  it('should create router once and export it', () => {
    expect(RouterMock).toHaveBeenCalledTimes(1);
    expect(storageRoutes).toBe(mockRouter);
  });

  it('should register signed file endpoint', () => {
    expect(mockRouter.get).toHaveBeenCalledWith('/files/{*key}', storageControllerMock.serveFile);
  });
});
