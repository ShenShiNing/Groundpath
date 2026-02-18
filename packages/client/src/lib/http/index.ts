/**
 * HTTP 层公共模块入口。
 *
 * lib/http/
 * ├── auth.ts          - Token 管理（单一来源）
 * ├── headers.ts       - 公共 header 构造
 * ├── error.ts         - 统一错误处理
 * ├── api-client.ts    - Axios 实例 + 拦截器
 * └── stream-client.ts - 流式 fetch（SSE）
 */

// Error
export { ApiRequestError, unwrapResponse, extractResponseError } from './error';

// Headers
export { buildHeaders } from './headers';

// Auth
export {
  setTokenAccessors,
  getAccessToken,
  hasRefreshToken,
  getOrRefreshToken,
  ensureAccessToken,
  type TokenAccessors,
} from './auth';

// Clients
export { apiClient } from './api-client';
export {
  fetchStreamWithAuth,
  type StreamFetchConfig,
  type StreamFetchResult,
} from './stream-client';
export {
  parseSSEStream,
  createSSEDispatcher,
  type SSEEventHandlers,
  type SSEParserOptions,
} from './sse';
