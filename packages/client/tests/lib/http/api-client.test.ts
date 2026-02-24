import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  getAccessToken: vi.fn((): string | null => null),
  hasRefreshToken: vi.fn((): boolean => false),
  getOrRefreshToken: vi.fn<() => Promise<string>>(),
}));

vi.mock('@/lib/http/auth', () => ({
  getAccessToken: authMocks.getAccessToken,
  hasRefreshToken: authMocks.hasRefreshToken,
  getOrRefreshToken: authMocks.getOrRefreshToken,
}));

import { apiClient, handleUnauthorizedError, setRequestHeader } from '@/lib/http/api-client';

function createUnauthorizedError(config: InternalAxiosRequestConfig): AxiosError<ApiResponse> {
  const response: AxiosResponse<ApiResponse> = {
    data: {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      },
      timestamp: new Date().toISOString(),
    },
    status: 401,
    statusText: 'Unauthorized',
    headers: {},
    config,
  };

  return new AxiosError<ApiResponse>(
    'Unauthorized',
    'ERR_BAD_REQUEST',
    config,
    undefined,
    response
  );
}

describe('api-client header compatibility and retry', () => {
  afterEach(() => {
    vi.clearAllMocks();
    authMocks.getAccessToken.mockReturnValue(null);
    authMocks.hasRefreshToken.mockReturnValue(false);
    authMocks.getOrRefreshToken.mockReset();
  });

  it('supports plain-object headers fallback when setting request headers', () => {
    const config = { headers: {} } as InternalAxiosRequestConfig;

    setRequestHeader(config, 'Authorization', 'Bearer token');

    expect(config.headers.Authorization).toBe('Bearer token');
  });

  it('uses headers.set when available', () => {
    const setMock = vi.fn();
    const config = { headers: { set: setMock } } as unknown as InternalAxiosRequestConfig;

    setRequestHeader(config, 'Authorization', 'Bearer token');

    expect(setMock).toHaveBeenCalledWith('Authorization', 'Bearer token');
  });

  it('retries with refreshed token when 401 occurs', async () => {
    authMocks.hasRefreshToken.mockReturnValue(true);
    authMocks.getOrRefreshToken.mockResolvedValue('new-access-token');

    const originalRequest = {
      url: '/api/documents/test-id',
      method: 'get',
      headers: {},
    } as InternalAxiosRequestConfig;
    const adapterMock = vi
      .fn()
      .mockResolvedValueOnce({ data: { ok: true }, status: 200, statusText: 'OK', headers: {} });
    const previousAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = adapterMock;

    try {
      const result = await handleUnauthorizedError(createUnauthorizedError(originalRequest));

      expect(authMocks.getOrRefreshToken).toHaveBeenCalledTimes(1);
      expect(adapterMock).toHaveBeenCalledTimes(1);
      expect(
        (adapterMock.mock.calls[0]?.[0] as InternalAxiosRequestConfig).headers.Authorization
      ).toBe('Bearer new-access-token');
      expect(result.status).toBe(200);
    } finally {
      apiClient.defaults.adapter = previousAdapter;
    }
  });

  it('rejects original error when no refresh token is available', async () => {
    authMocks.hasRefreshToken.mockReturnValue(false);
    const originalRequest = {
      url: '/api/documents/test-id',
      method: 'get',
      headers: {},
    } as InternalAxiosRequestConfig;
    const error = createUnauthorizedError(originalRequest);

    await expect(handleUnauthorizedError(error)).rejects.toBe(error);
  });

  it('rejects refresh error when token refresh fails', async () => {
    authMocks.hasRefreshToken.mockReturnValue(true);
    const refreshError = new Error('refresh failed');
    authMocks.getOrRefreshToken.mockRejectedValue(refreshError);
    const originalRequest = {
      url: '/api/documents/test-id',
      method: 'get',
      headers: {},
    } as InternalAxiosRequestConfig;

    await expect(handleUnauthorizedError(createUnauthorizedError(originalRequest))).rejects.toBe(
      refreshError
    );
  });
});
