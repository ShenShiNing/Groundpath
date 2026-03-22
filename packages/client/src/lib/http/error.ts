import type { ApiResponse } from '@groundpath/shared/types';
import { isSuccessResponse } from '@groundpath/shared/types';

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

/** 从 fetch Response 中提取标准错误对象 */
export async function extractResponseError(
  response: Response
): Promise<{ code: string; message: string }> {
  try {
    const data = await response.json();
    return {
      code: data.error?.code || 'REQUEST_FAILED',
      message: data.error?.message || `HTTP ${response.status}`,
    };
  } catch {
    return {
      code: 'REQUEST_FAILED',
      message: `HTTP ${response.status}`,
    };
  }
}
