import type { ChunkPayload, SearchResult } from './vector.types';

export type VectorFilter = {
  documentId?: string;
  knowledgeBaseId?: string;
  indexVersionId?: string;
};

type SearchOptions = {
  limit?: number;
  scoreThreshold?: number;
  documentIds?: string[];
  knowledgeBaseId?: string;
};

export function buildMustConditions(filter: VectorFilter): Array<Record<string, unknown>> {
  const mustConditions: Array<Record<string, unknown>> = [];

  if (filter.documentId) {
    mustConditions.push({ key: 'documentId', match: { value: filter.documentId } });
  }
  if (filter.knowledgeBaseId) {
    mustConditions.push({ key: 'knowledgeBaseId', match: { value: filter.knowledgeBaseId } });
  }
  if (filter.indexVersionId) {
    mustConditions.push({ key: 'indexVersionId', match: { value: filter.indexVersionId } });
  }

  return mustConditions;
}

export function buildDeletedVectorConditions(
  deletedBeforeMs?: number
): Array<Record<string, unknown>> {
  const mustConditions: Array<Record<string, unknown>> = [
    { key: 'isDeleted', match: { value: true } },
  ];

  if (deletedBeforeMs !== undefined) {
    mustConditions.push({
      key: 'deletedAtMs',
      range: { lte: deletedBeforeMs },
    });
  }

  return mustConditions;
}

export function buildSearchFilter(userId: string, options?: SearchOptions): Record<string, unknown> {
  const mustConditions: Array<Record<string, unknown>> = [
    { key: 'userId', match: { value: userId } },
  ];
  const mustNotConditions: Array<Record<string, unknown>> = [
    { key: 'isDeleted', match: { value: true } },
  ];

  if (options?.knowledgeBaseId) {
    mustConditions.push({
      key: 'knowledgeBaseId',
      match: { value: options.knowledgeBaseId },
    });
  }

  if (options?.documentIds && options.documentIds.length > 0) {
    mustConditions.push({
      key: 'documentId',
      match: { any: options.documentIds },
    });
  }

  return {
    must: mustConditions,
    must_not: mustNotConditions,
  };
}

export function mapSearchResults(
  results: Array<{ id: unknown; payload?: unknown; score: number }>
): SearchResult[] {
  return results.map((result) => {
    const payload = result.payload as ChunkPayload;
    return {
      id: result.id as string,
      documentId: payload.documentId,
      knowledgeBaseId: payload.knowledgeBaseId,
      content: payload.content,
      score: result.score,
      chunkIndex: payload.chunkIndex,
      documentVersion: payload.version,
      indexVersionId: payload.indexVersionId,
    };
  });
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return '';
  }

  const details = error as Error & {
    data?: { status?: { error?: string } };
    response?: { status?: number };
    status?: number;
    message?: string;
  };

  return details.data?.status?.error ?? details.message ?? '';
}

function getErrorStatus(error: unknown): number | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const details = error as Error & {
    response?: { status?: number };
    status?: number;
    data?: { status?: { code?: number } };
  };

  return details.response?.status ?? details.status ?? details.data?.status?.code;
}

export function isCollectionNotFoundError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  const status = getErrorStatus(error);

  return (
    status === 404 ||
    (message.includes('collection') &&
      (message.includes('not found') || message.includes('does not exist')))
  );
}
