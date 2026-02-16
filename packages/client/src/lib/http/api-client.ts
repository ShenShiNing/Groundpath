/**
 * Axios 实例 + 拦截器。
 * Token 管理委托给 auth.ts，header 构造委托给 headers.ts。
 */

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import { getAccessToken, getOrRefreshToken, hasRefreshToken } from './auth';

type RetryableRequest = InternalAxiosRequestConfig & { _retry?: boolean };

const apiClient = axios.create({
  baseURL: '',
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ============================================================================
// 拦截器
// ============================================================================

/** 请求拦截器 — 自动添加 Bearer token */
apiClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/** 检查错误是否需要刷新 token */
function shouldRefreshToken(
  error: AxiosError<ApiResponse>,
  request: RetryableRequest | undefined
): boolean {
  if (!request) return false;
  if (error.response?.status !== 401) return false;
  if (request.url?.includes('/auth/refresh')) return false;
  if (request._retry) return false;
  return true;
}

/** 响应拦截器 — 401 自动刷新 token 并重试 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse>) => {
    const originalRequest = error.config as RetryableRequest | undefined;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    if (!shouldRefreshToken(error, originalRequest)) {
      return Promise.reject(error);
    }

    if (!hasRefreshToken()) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const newAccessToken = await getOrRefreshToken();
      originalRequest.headers.set('Authorization', `Bearer ${newAccessToken}`);
      return apiClient(originalRequest);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  }
);

export { apiClient };
