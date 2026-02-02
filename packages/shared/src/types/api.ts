// API 相关类型

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  /** Unique request ID for tracing errors in server logs */
  requestId?: string;
}

/**
 * API 响应类型 - 使用可辨析联合类型确保 success/data/error 互斥
 *
 * 成功时: { success: true, data: T }
 * 失败时: { success: false, error: ApiError }
 */
export type ApiResponse<T = unknown> =
  | { success: true; data: T; error?: never }
  | { success: false; data?: never; error: ApiError };

/**
 * 类型守卫：检查是否为成功响应
 */
export function isSuccessResponse<T>(
  response: ApiResponse<T>
): response is { success: true; data: T } {
  return response.success === true;
}

/**
 * 类型守卫：检查是否为错误响应
 */
export function isErrorResponse<T>(
  response: ApiResponse<T>
): response is { success: false; error: ApiError } {
  return response.success === false;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * 分页响应类型
 */
export type PaginatedResponse<T> =
  | { success: true; data: T[]; pagination: PaginationMeta; error?: never }
  | { success: false; data?: never; pagination?: never; error: ApiError };
