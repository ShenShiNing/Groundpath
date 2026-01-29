import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse, AuthResponse } from '@knowledge-agent/shared/types';

/** API 请求错误 */
export class ApiRequestError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.details = details;
  }
}

/** 解包 API 响应，提取 data 或抛出错误 */
export function unwrapResponse<T>(response: ApiResponse<T>): T {
  if (!response.success || !response.data) {
    const error = response.error ?? { code: 'UNKNOWN_ERROR', message: 'Unknown error' };
    throw new ApiRequestError(error.code, error.message, error.details);
  }
  return response.data;
}

const apiClient = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Token 管理 - 由 authStore 设置
let getAccessToken: (() => string | null) | null = null;
let getRefreshToken: (() => string | null) | null = null;
let onTokenRefreshed: ((tokens: AuthResponse['tokens']) => void) | null = null;
let onAuthError: (() => void) | null = null;

export function setTokenAccessors(accessors: {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  onTokenRefreshed: (tokens: AuthResponse['tokens']) => void;
  onAuthError: () => void;
}) {
  getAccessToken = accessors.getAccessToken;
  getRefreshToken = accessors.getRefreshToken;
  onTokenRefreshed = accessors.onTokenRefreshed;
  onAuthError = accessors.onAuthError;
}

// 请求拦截器 - 自动添加 Bearer token
apiClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken?.();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Token 刷新状态
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
}

// 响应拦截器 - 处理 401 错误并自动刷新 token
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // 跳过：非 401 错误、refresh 请求本身、已重试过的请求
    if (
      error.response?.status !== 401 ||
      originalRequest.url?.includes('/auth/refresh') ||
      originalRequest._retry
    ) {
      return Promise.reject(error);
    }

    const refreshToken = getRefreshToken?.();
    if (!refreshToken) {
      onAuthError?.();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // 等待正在进行的刷新完成
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh((token: string) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          resolve(apiClient(originalRequest));
        });
        // 添加超时避免无限等待
        setTimeout(() => reject(error), 10000);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const response = await apiClient.post<ApiResponse<AuthResponse>>('/api/auth/refresh', {
        refreshToken,
      });

      if (!response.data.success || !response.data.data) {
        throw new Error('Refresh failed');
      }

      const { tokens } = response.data.data;
      onTokenRefreshed?.(tokens);
      onRefreshed(tokens.accessToken);

      originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      onAuthError?.();
      refreshSubscribers = [];
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export { apiClient };
