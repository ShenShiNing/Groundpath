/**
 * 公共 HTTP header 构造。
 * 所有 fetch / axios 请求的 header 统一从此处生成，确保一致性。
 */

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

export interface BuildHeadersOptions {
  includeCsrfToken?: boolean;
}

/**
 * 从浏览器 cookie 中读取 CSRF token。
 */
export function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookiePrefix = `${CSRF_COOKIE_NAME}=`;
  const found = document.cookie
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(cookiePrefix));

  if (!found) {
    return null;
  }

  const value = found.slice(cookiePrefix.length);
  return value ? decodeURIComponent(value) : null;
}

/** 构建 JSON 请求 header，可选附带 Authorization 与 CSRF token */
export function buildHeaders(
  token?: string | null,
  options: BuildHeadersOptions = {}
): Record<string, string> {
  const { includeCsrfToken = false } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (includeCsrfToken) {
    const csrfToken = getCsrfTokenFromCookie();
    if (csrfToken) {
      headers[CSRF_HEADER_NAME] = csrfToken;
    }
  }

  return headers;
}
