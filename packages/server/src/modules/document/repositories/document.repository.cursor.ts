import { and, asc, desc, eq, gt, lt, or } from 'drizzle-orm';
import type { DocumentListParams, TrashListParams } from '@groundpath/shared/types';
import { AppError } from '@core/errors/app-error';
import { Errors } from '@core/errors';
import { documents, type Document } from '@core/db/schema/document/documents.schema';

type DocumentSortBy = DocumentListParams['sortBy'];
type TrashSortBy = TrashListParams['sortBy'];
type SortOrder = 'asc' | 'desc';
type CursorValue = string | number | Date;

interface CursorPayload<TSortBy extends string> {
  id: string;
  sortBy: TSortBy;
  sortOrder: SortOrder;
  value: string | number;
}

// ── Sort column mapping ─────────────────────────────────────────────

export function buildDocumentOrderBy(sortBy: DocumentSortBy) {
  return {
    createdAt: documents.createdAt,
    updatedAt: documents.updatedAt,
    title: documents.title,
    fileSize: documents.fileSize,
  }[sortBy];
}

export function buildTrashOrderBy(sortBy: TrashSortBy) {
  return {
    deletedAt: documents.deletedAt,
    title: documents.title,
    fileSize: documents.fileSize,
  }[sortBy];
}

// ── Stable order (sort column + id tiebreaker) ──────────────────────

export function buildStableDocumentOrder(
  sortColumn:
    | typeof documents.createdAt
    | typeof documents.updatedAt
    | typeof documents.title
    | typeof documents.fileSize,
  sortOrder: SortOrder
) {
  const orderByFn = sortOrder === 'asc' ? asc : desc;
  return [orderByFn(sortColumn), orderByFn(documents.id)] as const;
}

export function buildStableTrashOrder(
  sortColumn: typeof documents.deletedAt | typeof documents.title | typeof documents.fileSize,
  sortOrder: SortOrder
) {
  const orderByFn = sortOrder === 'asc' ? asc : desc;
  return [orderByFn(sortColumn), orderByFn(documents.id)] as const;
}

// ── Cursor encode / decode ──────────────────────────────────────────

export function encodeCursor<TSortBy extends string>(payload: CursorPayload<TSortBy>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function invalidCursorError() {
  return Errors.validation('Invalid pagination cursor');
}

export function decodeCursor<TSortBy extends string>(
  cursor: string,
  expectedSortBy: TSortBy,
  expectedSortOrder: SortOrder
): CursorPayload<TSortBy> {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    ) as CursorPayload<TSortBy>;
    if (
      !decoded ||
      typeof decoded !== 'object' ||
      typeof decoded.id !== 'string' ||
      decoded.id.length === 0 ||
      decoded.sortBy !== expectedSortBy ||
      decoded.sortOrder !== expectedSortOrder ||
      (typeof decoded.value !== 'string' && typeof decoded.value !== 'number')
    ) {
      throw invalidCursorError();
    }
    return decoded;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw invalidCursorError();
  }
}

// ── Cursor value parsing ────────────────────────────────────────────

export function parseDocumentCursorValue(
  sortBy: DocumentSortBy,
  value: string | number
): CursorValue {
  switch (sortBy) {
    case 'fileSize':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw invalidCursorError();
      }
      return value;
    case 'createdAt':
    case 'updatedAt': {
      if (typeof value !== 'string') {
        throw invalidCursorError();
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw invalidCursorError();
      }
      return parsed;
    }
    case 'title':
      if (typeof value !== 'string') {
        throw invalidCursorError();
      }
      return value;
  }
}

export function parseTrashCursorValue(sortBy: TrashSortBy, value: string | number): CursorValue {
  if (sortBy === 'fileSize') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw invalidCursorError();
    }
    return value;
  }

  if (typeof value !== 'string') {
    throw invalidCursorError();
  }

  if (sortBy === 'deletedAt') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw invalidCursorError();
    }
    return parsed;
  }

  return value;
}

// ── Cursor value extraction from document ───────────────────────────

export function getDocumentCursorValue(
  document: Document,
  sortBy: DocumentSortBy
): string | number {
  switch (sortBy) {
    case 'createdAt':
      return document.createdAt.toISOString();
    case 'updatedAt':
      return document.updatedAt.toISOString();
    case 'title':
      return document.title;
    case 'fileSize':
      return document.fileSize;
  }
}

export function getTrashCursorValue(document: Document, sortBy: TrashSortBy): string | number {
  switch (sortBy) {
    case 'deletedAt':
      return document.deletedAt!.toISOString();
    case 'title':
      return document.title;
    case 'fileSize':
      return document.fileSize;
  }
}

// ── Cursor WHERE condition ──────────────────────────────────────────

export function buildCursorCondition(
  column:
    | typeof documents.createdAt
    | typeof documents.updatedAt
    | typeof documents.deletedAt
    | typeof documents.title
    | typeof documents.fileSize,
  cursorValue: CursorValue,
  cursorId: string,
  sortOrder: SortOrder
) {
  const compare = sortOrder === 'asc' ? gt : lt;
  const condition = or(
    compare(column, cursorValue),
    and(eq(column, cursorValue), compare(documents.id, cursorId))
  );
  if (!condition) {
    throw Errors.internal('Failed to build pagination cursor condition');
  }
  return condition;
}
