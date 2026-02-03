import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse, AuthResponse } from '@knowledge-agent/shared/types';
import { isSuccessResponse } from '@knowledge-agent/shared/types';

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
  if (isSuccessResponse(response)) {
    return response.data;
  }
  const error = response.error;
  throw new ApiRequestError(error.code, error.message, error.details);
}

const apiClient = axios.create({
  baseURL: '',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ============================================================================
// Token 管理接口
// ============================================================================

interface TokenAccessors {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  onTokenRefreshed: (tokens: AuthResponse['tokens']) => void;
  onAuthError: () => void;
}

let tokenAccessors: TokenAccessors | null = null;

export function setTokenAccessors(accessors: TokenAccessors): void {
  tokenAccessors = accessors;
}

/** 检查是否有可用的 refresh token */
export function hasRefreshToken(): boolean {
  return !!tokenAccessors?.getRefreshToken();
}

// ============================================================================
// Token 刷新逻辑 - 被动刷新，仅在 401 时触发
// ============================================================================

/** 当前正在进行的刷新 Promise（确保并发请求共享同一个刷新） */
let refreshPromise: Promise<string> | null = null;

type RetryableRequest = InternalAxiosRequestConfig & { _retry?: boolean };

/** 执行 token 刷新请求 */
async function executeRefresh(): Promise<string> {
  const refreshToken = tokenAccessors?.getRefreshToken();

  if (!refreshToken) {
    throw new ApiRequestError('AUTH_ERROR', 'No refresh token available');
  }

  try {
    const response = await apiClient.post<ApiResponse<AuthResponse>>('/api/auth/refresh', {
      refreshToken,
    });

    const authResponse = unwrapResponse(response.data);
    const { accessToken } = authResponse.tokens;

    // 通知外部更新 token
    tokenAccessors?.onTokenRefreshed(authResponse.tokens);

    return accessToken;
  } catch (error) {
    // 刷新失败，清除本地状态
    tokenAccessors?.onAuthError();
    throw error;
  }
}

/**
 * 获取或执行 token 刷新
 * 确保并发请求共享同一个刷新 Promise，避免重复刷新
 */
export function getOrRefreshToken(): Promise<string> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = executeRefresh().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

/** 检查错误是否需要刷新 token */
function shouldRefreshToken(
  error: AxiosError<ApiResponse>,
  request: RetryableRequest | undefined
): boolean {
  // 没有请求配置，无法重试
  if (!request) {
    return false;
  }

  // 不是 401，不需要刷新
  if (error.response?.status !== 401) {
    return false;
  }

  // 刷新接口本身出错，不要重试
  if (request.url?.includes('/auth/refresh')) {
    return false;
  }

  // 已经重试过，不要再刷新
  if (request._retry) {
    return false;
  }

  return true;
}

// ============================================================================
// Axios 拦截器配置
// ============================================================================

/**
 * 请求拦截器 - 自动添加 Bearer token
 */
apiClient.interceptors.request.use(
  (config) => {
    const token = tokenAccessors?.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * 响应拦截器 - 处理 401 错误并自动刷新 token
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse>) => {
    const originalRequest = error.config as RetryableRequest | undefined;

    // 如果没有原始请求配置，无法重试
    if (!originalRequest) {
      return Promise.reject(error);
    }

    // 检查是否需要刷新 token
    if (!shouldRefreshToken(error, originalRequest)) {
      return Promise.reject(error);
    }

    // 检查是否有 refresh token
    if (!tokenAccessors?.getRefreshToken()) {
      tokenAccessors?.onAuthError();
      return Promise.reject(error);
    }

    // 标记为已重试，避免无限循环
    originalRequest._retry = true;

    try {
      // 刷新 token（并发请求会等待同一个 Promise）
      const newAccessToken = await getOrRefreshToken();

      // 使用新 token 重试原请求
      originalRequest.headers.set('Authorization', `Bearer ${newAccessToken}`);
      return apiClient(originalRequest);
    } catch (refreshError) {
      // 刷新失败，拒绝原请求
      return Promise.reject(refreshError);
    }
  }
);

export { apiClient };
