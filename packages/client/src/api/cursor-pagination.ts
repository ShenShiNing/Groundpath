import type { CursorPaginationMeta } from '@groundpath/shared/types';

interface CursorPageResponse {
  pagination: CursorPaginationMeta;
}

interface CollectCursorPagesOptions<TResponse extends CursorPageResponse> {
  fetchPage: (cursor?: string) => Promise<TResponse>;
  mergePages: (pages: TResponse[]) => TResponse;
  maxPages?: number;
}

export async function collectCursorPages<TResponse extends CursorPageResponse>({
  fetchPage,
  mergePages,
  maxPages = 100,
}: CollectCursorPagesOptions<TResponse>): Promise<TResponse> {
  const pages: TResponse[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const response = await fetchPage(cursor);
    pages.push(response);

    if (!response.pagination.hasMore || !response.pagination.nextCursor) {
      return mergePages(pages);
    }

    if (seenCursors.has(response.pagination.nextCursor)) {
      throw new Error('Cursor pagination loop detected');
    }

    seenCursors.add(response.pagination.nextCursor);
    cursor = response.pagination.nextCursor;
  }

  throw new Error(`Cursor pagination exceeded ${maxPages} pages`);
}
