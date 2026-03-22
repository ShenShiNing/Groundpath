/**
 * Token 管理 — 单一来源。
 * axios 拦截器 & stream-client 均从此处获取 / 刷新 token。
 * executeRefresh 使用原生 fetch，避免与 axios 实例循环依赖。
 */

import type { ApiResponse, AuthResponse } from '@groundpath/shared/types';
import i18n from '@/i18n/i18n';
import { logClientError } from '@/lib/logger';
import { ApiRequestError, unwrapResponse } from './error';
import { buildHeaders } from './headers';

// ============================================================================
// Token 访问接口
// ============================================================================

export interface TokenAccessors {
  getAccessToken: () => string | null;
  isAuthenticated: () => boolean;
  onTokenRefreshed: (accessToken: string) => void;
  onAuthError: () => void;
}

let tokenAccessors: TokenAccessors | null = null;

export function setTokenAccessors(accessors: TokenAccessors): void {
  tokenAccessors = accessors;
}

export function getAccessToken(): string | null {
  return tokenAccessors?.getAccessToken() ?? null;
}

export function hasRefreshToken(): boolean {
  return tokenAccessors?.isAuthenticated() ?? false;
}

// ============================================================================
// Token 刷新逻辑
// ============================================================================

/** 当前正在进行的刷新 Promise（确保并发请求共享同一个刷新） */
let refreshPromise: Promise<string> | null = null;

/** 执行 token 刷新请求（使用原生 fetch，避免与 apiClient 循环依赖） */
async function executeRefresh(): Promise<string> {
  if (!tokenAccessors?.isAuthenticated()) {
    throw new ApiRequestError('AUTH_ERROR', i18n.t('auth.noActiveSession', { ns: 'common' }));
  }

  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: buildHeaders(undefined, { includeCsrfToken: true }),
      credentials: 'include',
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new ApiRequestError(
        'AUTH_ERROR',
        i18n.t('auth.refreshFailed', {
          ns: 'common',
          status: response.status,
        })
      );
    }

    const data = (await response.json()) as ApiResponse<AuthResponse>;
    const authResponse = unwrapResponse(data);
    const { accessToken } = authResponse.tokens;

    tokenAccessors?.onTokenRefreshed(accessToken);

    return accessToken;
  } catch (error) {
    logClientError('http.auth.executeRefresh', error);
    tokenAccessors?.onAuthError();
    throw error;
  }
}

/**
 * 获取或执行 token 刷新。
 * 并发请求共享同一个 Promise，避免重复刷新。
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

/**
 * 确保存在可用的 access token。
 * 若 token 缺失且有 refresh token，则主动刷新。
 */
export async function ensureAccessToken(): Promise<string | null> {
  const token = getAccessToken();

  if (token) {
    return token;
  }

  if (!hasRefreshToken()) {
    return null;
  }

  try {
    return await getOrRefreshToken();
  } catch {
    throw new ApiRequestError('AUTH_ERROR', i18n.t('auth.sessionExpired', { ns: 'common' }));
  }
}
