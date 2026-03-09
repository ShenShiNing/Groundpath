import type { Citation } from '@knowledge-agent/shared/types';
import {
  documentNodeSearchRepository,
  type AccessibleNodeHeadRow,
} from '../../repositories/document-node-search.repository';
import { documentIndexCacheService } from '../document-index-cache.service';

export interface OutlineSearchInput {
  userId: string;
  knowledgeBaseId?: string | null;
  documentIds?: string[];
  query: string;
  limit?: number;
  includeContentPreview?: boolean;
}

export interface OutlineSearchResultItem {
  nodeId: string;
  documentId: string;
  documentTitle: string;
  documentVersion: number;
  indexVersion: string;
  title: string | null;
  sectionPath: string[];
  pageStart?: number;
  pageEnd?: number;
  locator: string;
  score: number;
  matchReason: string;
  contentPreview?: string;
}

interface ScoredOutlineRow extends OutlineSearchResultItem {
  rawRow: AccessibleNodeHeadRow;
}

function toLocator(row: AccessibleNodeHeadRow): string {
  const base = row.stableLocator || row.sectionPath?.join(' > ') || row.title || row.documentTitle;
  if (row.pageStart && row.pageEnd) {
    return row.pageStart === row.pageEnd
      ? `${base} / p.${row.pageStart}`
      : `${base} / p.${row.pageStart}-${row.pageEnd}`;
  }
  if (row.pageStart) return `${base} / p.${row.pageStart}`;
  if (row.pageEnd) return `${base} / p.${row.pageEnd}`;
  return base;
}

function extractAliases(row: AccessibleNodeHeadRow): string[] {
  const aliases = new Set<string>();
  const candidates = [row.title ?? '', row.stableLocator ?? '', ...(row.sectionPath ?? [])];

  for (const candidate of candidates) {
    const normalized = candidate.trim().toLowerCase();
    if (normalized) aliases.add(normalized);

    const numberedMatch = candidate.match(/(\d+(?:\.\d+)+|\d+)/);
    if (numberedMatch?.[1]) {
      aliases.add(numberedMatch[1].toLowerCase());
      aliases.add(`section ${numberedMatch[1].toLowerCase()}`);
    }

    const appendixMatch = candidate.match(
      /(?:appendix|附录)\s*([A-Z0-9一二三四五六七八九十百零\d]+)/iu
    );
    if (appendixMatch?.[1]) {
      const appendixId = appendixMatch[1].toLowerCase();
      aliases.add(`appendix ${appendixId}`);
      aliases.add(`附录 ${appendixId}`);
    }

    const chapterMatch = candidate.match(
      /(?:chapter\s+(\d+)|第\s*([一二三四五六七八九十百零\d]+)\s*章)/iu
    );
    if (chapterMatch) {
      const chapterId = (chapterMatch[1] ?? chapterMatch[2] ?? '').toLowerCase();
      if (chapterId) {
        aliases.add(`chapter ${chapterId}`);
        aliases.add(`第${chapterId}章`);
      }
    }
  }

  return [...aliases];
}

function scoreRow(row: AccessibleNodeHeadRow, query: string, terms: string[], preview?: string) {
  const queryLower = query.trim().toLowerCase();
  const title = (row.title ?? '').toLowerCase();
  const locator = (row.stableLocator ?? row.sectionPath?.join(' > ') ?? '').toLowerCase();
  const previewText = (preview ?? '').toLowerCase();
  const aliases = extractAliases(row);

  let score = 0;
  let matchReason = 'preview';

  if (queryLower && aliases.includes(queryLower)) {
    score += 12;
    matchReason = 'alias';
  }
  if (queryLower && title.includes(queryLower)) {
    score += 10;
    if (matchReason !== 'alias') matchReason = 'title';
  }
  if (queryLower && locator.includes(queryLower)) {
    score += 8;
    if (!['alias', 'title'].includes(matchReason)) matchReason = 'locator';
  }
  if (queryLower && previewText.includes(queryLower)) {
    score += 4;
    if (score < 8) matchReason = 'preview';
  }

  for (const term of terms) {
    if (aliases.some((alias) => alias.includes(term))) score += 3.5;
    if (title.includes(term)) score += 3;
    if (locator.includes(term)) score += 2;
    if (previewText.includes(term)) score += 1;
  }

  if (row.nodeType === 'chapter') score += 1.5;
  if (row.nodeType === 'section') score += 1;
  if (row.depth <= 2) score += 0.5;

  return { score, matchReason };
}

export const outlineSearchService = {
  async search(input: OutlineSearchInput): Promise<{
    results: OutlineSearchResultItem[];
    citations: Citation[];
  }> {
    const query = input.query.trim();
    if (!query) {
      return { results: [], citations: [] };
    }

    const limit = input.limit ?? 5;
    return documentIndexCacheService.getOutlineSearch(
      {
        userId: input.userId,
        knowledgeBaseId: input.knowledgeBaseId,
        documentIds: input.documentIds,
        query,
        limit,
        includeContentPreview: !!input.includeContentPreview,
      },
      async () => {
        const terms = [
          ...new Set(
            query
              .toLowerCase()
              .split(/\s+/)
              .filter((term) => term.length >= 2)
          ),
        ];
        const rows = await documentNodeSearchRepository.searchActiveNodeHeads({
          userId: input.userId,
          knowledgeBaseId: input.knowledgeBaseId,
          documentIds: input.documentIds,
          terms: [query.toLowerCase(), ...terms],
          limit: Math.max(limit, 10),
        });

        const previewCache = new Map<string, string>();
        const scoredHeads: ScoredOutlineRow[] = rows
          .map((row) => {
            const { score, matchReason } = scoreRow(row, query, terms);
            return {
              rawRow: row,
              nodeId: row.nodeId,
              documentId: row.documentId,
              documentTitle: row.documentTitle,
              documentVersion: row.documentVersion,
              indexVersion: row.indexVersion,
              title: row.title,
              sectionPath: row.sectionPath ?? [],
              pageStart: row.pageStart ?? undefined,
              pageEnd: row.pageEnd ?? undefined,
              locator: toLocator(row),
              score,
              matchReason,
              contentPreview: undefined,
            };
          })
          .filter((row) => row.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        const missingPreviewRows = await Promise.all(
          scoredHeads.map(async (row) => {
            const cachedPreview = await documentIndexCacheService.getNodePreview(
              row.documentId,
              row.nodeId
            );
            if (cachedPreview) {
              previewCache.set(row.nodeId, cachedPreview);
              return null;
            }
            return row;
          })
        );

        const missingPreviewIds = missingPreviewRows
          .filter((row): row is ScoredOutlineRow => !!row)
          .map((row) => row.nodeId);

        if (missingPreviewIds.length > 0) {
          const loadedPreviews = await documentNodeSearchRepository.getContentPreviewsByNodeIds(
            missingPreviewIds
          );
          for (const row of scoredHeads) {
            const preview = loadedPreviews.get(row.nodeId);
            if (preview) {
              previewCache.set(row.nodeId, preview);
              void documentIndexCacheService.setNodePreview(row.documentId, row.nodeId, preview);
            }
          }
        }

        const scored = scoredHeads.map((row) => {
          const preview = previewCache.get(row.nodeId);
          const rescored = scoreRow(row.rawRow, query, terms, preview);
          return {
            ...row,
            score: rescored.score,
            matchReason: rescored.matchReason,
            contentPreview: preview,
          };
        });

        const citations: Citation[] = scored.map((row) => ({
          sourceType: 'node',
          documentId: row.documentId,
          documentTitle: row.documentTitle,
          documentVersion: row.documentVersion,
          indexVersion: row.indexVersion,
          nodeId: row.nodeId,
          sectionPath: row.sectionPath,
          pageStart: row.pageStart,
          pageEnd: row.pageEnd,
          locator: row.locator,
          excerpt: row.contentPreview ?? row.title ?? row.locator,
          score: row.score,
        }));

        return {
          results: await Promise.all(
            scored.map(async (row) => {
              if (!input.includeContentPreview) {
                return { ...row, contentPreview: undefined };
              }

              const cachedPreview =
                (await documentIndexCacheService.getNodePreview(row.documentId, row.nodeId)) ??
                row.contentPreview;

              return {
                ...row,
                contentPreview: cachedPreview ?? undefined,
              };
            })
          ),
          citations,
        };
      }
    );
  },
};
