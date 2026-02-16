/**
 * 基于原生 fetch 的流式请求客户端。
 * 用于 SSE 等需要 ReadableStream 的场景。
 * Token 管理 / header / 错误提取均使用 lib/http 公共模块。
 */

import { getOrRefreshToken, hasRefreshToken, ensureAccessToken } from './auth';
import { buildHeaders } from './headers';
import { extractResponseError } from './error';

export interface StreamFetchConfig {
  /** 获取当前 access token */
  getAccessToken: () => string | null;
  /** 取消信号 */
  signal?: AbortSignal;
}

export type StreamFetchResult =
  | { ok: true; reader: ReadableStreamDefaultReader<Uint8Array> }
  | { ok: false; error: { code: string; message: string } };

/**
 * 带 token 刷新的流式 fetch。
 *
 * - 首次请求前主动确保 token 可用
 * - 401 时刷新 token 并重试一次
 * - 成功返回 ReadableStream reader，失败返回错误对象
 */
export async function fetchStreamWithAuth(
  url: string,
  init: Omit<RequestInit, 'signal'>,
  config: StreamFetchConfig
): Promise<StreamFetchResult> {
  const { getAccessToken, signal } = config;

  const attempt = async (isRetry: boolean): Promise<StreamFetchResult> => {
    // 首次请求前主动刷新
    if (!isRetry && hasRefreshToken()) {
      await ensureAccessToken();
    }

    const token = getAccessToken();
    const response = await fetch(url, {
      ...init,
      headers: buildHeaders(token),
      credentials: 'include',
      signal,
    });

    // 401 — 尝试刷新并重试一次
    if (response.status === 401 && !isRetry) {
      if (hasRefreshToken()) {
        try {
          await getOrRefreshToken();
          return attempt(true);
        } catch {
          return {
            ok: false,
            error: { code: 'AUTH_ERROR', message: 'Session expired. Please login again.' },
          };
        }
      }
      return {
        ok: false,
        error: { code: 'AUTH_ERROR', message: 'Session expired. Please login again.' },
      };
    }

    // 其他非成功响应
    if (!response.ok) {
      return { ok: false, error: await extractResponseError(response) };
    }

    // 获取 reader
    const reader = response.body?.getReader();
    if (!reader) {
      return { ok: false, error: { code: 'NO_BODY', message: 'No response body' } };
    }

    return { ok: true, reader };
  };

  try {
    return await attempt(false);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        ok: false,
        error: { code: 'ABORTED', message: 'Request was aborted' },
      };
    }
    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network request failed',
      },
    };
  }
}
