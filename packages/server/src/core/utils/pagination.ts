// ============================================================================
// Pagination Utilities
// ============================================================================

import type { CursorPaginationMeta, PaginationMeta } from '@groundpath/shared/types';

export type { CursorPaginationMeta, PaginationMeta } from '@groundpath/shared/types';

/**
 * Default page size for list queries
 */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Maximum allowed page size to prevent abuse
 */
export const MAX_PAGE_SIZE = 100;

/**
 * Build pagination metadata from total count and request params
 */
export function buildPagination(total: number, page: number, pageSize: number): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

export function buildCursorPagination(
  total: number,
  pageSize: number,
  hasMore: boolean,
  nextCursor: string | null
): CursorPaginationMeta {
  return {
    pageSize,
    total,
    hasMore,
    nextCursor,
  };
}

export function normalizePageSize(pageSize: number): number {
  return Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize));
}

/**
 * Calculate SQL offset and limit from pagination params
 * Also normalizes params to safe values
 */
export function getOffsetLimit(params: { page: number; pageSize: number }): {
  offset: number;
  limit: number;
} {
  const page = Math.max(1, params.page);
  const pageSize = normalizePageSize(params.pageSize);

  return {
    offset: (page - 1) * pageSize,
    limit: pageSize,
  };
}
