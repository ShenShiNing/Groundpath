/**
 * 公共 HTTP header 构造。
 * 所有 fetch / axios 请求的 header 统一从此处生成，确保一致性。
 */

/** 构建 JSON 请求 header，可选附带 Authorization */
export function buildHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}
