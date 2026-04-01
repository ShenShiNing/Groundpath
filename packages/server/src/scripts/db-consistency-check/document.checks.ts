import { db } from '@core/db';
import { sql, eq, and, isNull, isNotNull, count, or, lt, ne } from 'drizzle-orm';
import { documentConfig } from '@core/config/env';
import { documents } from '@core/db/schema/document/documents.schema';
import { documentVersions } from '@core/db/schema/document/document-versions.schema';
import { documentChunks } from '@core/db/schema/document/document-chunks.schema';
import { documentIndexVersions } from '@core/db/schema/document/document-index-versions.schema';
import { knowledgeBases } from '@core/db/schema/document/knowledge-bases.schema';
import type { CheckResult } from './types';

function extractRows<T>(result: unknown): T[] {
  return (result as [T[]])[0] ?? [];
}

async function checkOrphanDocuments(): Promise<CheckResult> {
  const name = '1. Orphan documents (missing knowledge_base)';
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      knowledgeBaseId: documents.knowledgeBaseId,
    })
    .from(documents)
    .leftJoin(knowledgeBases, eq(documents.knowledgeBaseId, knowledgeBases.id))
    .where(and(isNull(knowledgeBases.id), isNull(documents.deletedAt)));

  return {
    name,
    passed: rows.length === 0,
    count: rows.length,
    details: rows.map((row) => `doc=${row.id} title="${row.title}" kb=${row.knowledgeBaseId}`),
  };
}

async function checkOrphanDocumentVersions(): Promise<CheckResult> {
  const name = '2. Orphan document_versions (missing document)';
  const rows = await db
    .select({
      id: documentVersions.id,
      documentId: documentVersions.documentId,
      version: documentVersions.version,
    })
    .from(documentVersions)
    .leftJoin(documents, eq(documentVersions.documentId, documents.id))
    .where(isNull(documents.id));

  return {
    name,
    passed: rows.length === 0,
    count: rows.length,
    details: rows.map((row) => `version=${row.id} doc=${row.documentId} v${row.version}`),
  };
}

async function checkOrphanDocumentChunks(): Promise<CheckResult> {
  const name = '3. Orphan document_chunks (missing document/index version)';
  const rows = await db
    .select({
      id: documentChunks.id,
      documentId: documentChunks.documentId,
      indexVersionId: documentChunks.indexVersionId,
    })
    .from(documentChunks)
    .leftJoin(documents, eq(documentChunks.documentId, documents.id))
    .leftJoin(documentIndexVersions, eq(documentChunks.indexVersionId, documentIndexVersions.id))
    .where(or(isNull(documents.id), isNull(documentIndexVersions.id)));

  return {
    name,
    passed: rows.length === 0,
    count: rows.length,
    details: rows.map(
      (row) => `chunk=${row.id} doc=${row.documentId} indexVersionId=${row.indexVersionId}`
    ),
  };
}

async function checkKbDocumentCountMismatch(): Promise<CheckResult> {
  const name = '4. KB documentCount mismatch';
  const rows = await db.execute(sql`
    SELECT
      kb.id,
      kb.name,
      kb.document_count AS stored_count,
      COALESCE(agg.cnt, 0) AS actual_count
    FROM knowledge_bases kb
    LEFT JOIN (
      SELECT knowledge_base_id, COUNT(*) AS cnt
      FROM documents
      WHERE deleted_at IS NULL
      GROUP BY knowledge_base_id
    ) agg ON kb.id = agg.knowledge_base_id
    WHERE kb.deleted_at IS NULL
      AND kb.document_count != COALESCE(agg.cnt, 0)
  `);

  const results = extractRows<{
    id: string;
    name: string;
    stored_count: number;
    actual_count: number;
  }>(rows);

  return {
    name,
    passed: results.length === 0,
    count: results.length,
    details: results.map(
      (row) => `kb=${row.id} "${row.name}" stored=${row.stored_count} actual=${row.actual_count}`
    ),
  };
}

async function checkKbTotalChunksMismatch(): Promise<CheckResult> {
  const name = '5. KB totalChunks mismatch';
  const rows = await db.execute(sql`
    SELECT
      kb.id,
      kb.name,
      kb.total_chunks AS stored_count,
      COALESCE(agg.total, 0) AS actual_count
    FROM knowledge_bases kb
    LEFT JOIN (
      SELECT knowledge_base_id, SUM(chunk_count) AS total
      FROM documents
      WHERE deleted_at IS NULL
      GROUP BY knowledge_base_id
    ) agg ON kb.id = agg.knowledge_base_id
    WHERE kb.deleted_at IS NULL
      AND kb.total_chunks != COALESCE(agg.total, 0)
  `);

  const results = extractRows<{
    id: string;
    name: string;
    stored_count: number;
    actual_count: number;
  }>(rows);

  return {
    name,
    passed: results.length === 0,
    count: results.length,
    details: results.map(
      (row) => `kb=${row.id} "${row.name}" stored=${row.stored_count} actual=${row.actual_count}`
    ),
  };
}

async function checkDocumentChunkCountMismatch(): Promise<CheckResult> {
  const name = '6. Document chunkCount mismatch';
  const rows = await db.execute(sql`
    SELECT
      d.id,
      d.title,
      d.chunk_count AS stored_count,
      COALESCE(agg.cnt, 0) AS actual_count
    FROM documents d
    LEFT JOIN (
      SELECT dc.document_id, COUNT(*) AS cnt
      FROM document_chunks dc
      INNER JOIN documents docs
        ON docs.id = dc.document_id
       AND docs.active_index_version_id = dc.index_version_id
      GROUP BY dc.document_id
    ) agg ON d.id = agg.document_id
    WHERE d.deleted_at IS NULL
      AND d.chunk_count != COALESCE(agg.cnt, 0)
  `);

  const results = extractRows<{
    id: string;
    title: string;
    stored_count: number;
    actual_count: number;
  }>(rows);

  return {
    name,
    passed: results.length === 0,
    count: results.length,
    details: results.map(
      (row) => `doc=${row.id} "${row.title}" stored=${row.stored_count} actual=${row.actual_count}`
    ),
  };
}

async function checkStaleProcessingStatus(): Promise<CheckResult> {
  const name = '7. Stale processing/failed status backlog';
  const staleBefore = new Date(Date.now() - documentConfig.processingTimeoutMinutes * 60_000);

  const processingRows = await db
    .select({ cnt: count() })
    .from(documents)
    .where(
      and(
        eq(documents.processingStatus, 'processing'),
        isNull(documents.deletedAt),
        isNotNull(documents.processingStartedAt),
        lt(documents.processingStartedAt, staleBefore)
      )
    );

  const failedRows = await db
    .select({ cnt: count() })
    .from(documents)
    .where(and(eq(documents.processingStatus, 'failed'), isNull(documents.deletedAt)));

  const processingCount = processingRows[0]?.cnt ?? 0;
  const failedCount = failedRows[0]?.cnt ?? 0;
  const totalStale = processingCount + failedCount;

  const details: string[] = [];
  if (processingCount > 0) {
    details.push(
      `processing timeout: ${processingCount} document(s) older than ${documentConfig.processingTimeoutMinutes} minute(s)`
    );
  }
  if (failedCount > 0) {
    details.push(`failed: ${failedCount} document(s)`);
  }

  return {
    name,
    passed: totalStale === 0,
    count: totalStale,
    details,
  };
}

async function checkDuplicateChunkKeys(): Promise<CheckResult> {
  const name = '8. Duplicate document_chunks composite key';
  const rows = await db.execute(sql`
    SELECT
      document_id,
      index_version_id,
      chunk_index,
      COUNT(*) AS cnt
    FROM document_chunks
    GROUP BY document_id, index_version_id, chunk_index
    HAVING COUNT(*) > 1
    LIMIT 100
  `);

  const results = extractRows<{
    document_id: string;
    index_version_id: string;
    chunk_index: number;
    cnt: number;
  }>(rows);

  return {
    name,
    passed: results.length === 0,
    count: results.length,
    details: results.map(
      (row) =>
        `doc=${row.document_id} indexVersionId=${row.index_version_id} chunk=${row.chunk_index} count=${row.cnt}`
    ),
  };
}

export async function checkDocumentOwnershipMismatch(): Promise<CheckResult> {
  const name = '9. Document ownership mismatch (document.user_id != knowledge_base.user_id)';
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      documentUserId: documents.userId,
      knowledgeBaseId: knowledgeBases.id,
      knowledgeBaseUserId: knowledgeBases.userId,
    })
    .from(documents)
    .innerJoin(knowledgeBases, eq(documents.knowledgeBaseId, knowledgeBases.id))
    .where(ne(documents.userId, knowledgeBases.userId));

  return {
    name,
    passed: rows.length === 0,
    count: rows.length,
    details: rows.map(
      (row) =>
        `doc=${row.id} title="${row.title}" docUser=${row.documentUserId} kb=${row.knowledgeBaseId} kbUser=${row.knowledgeBaseUserId}`
    ),
  };
}

export const documentConsistencyChecks = [
  checkOrphanDocuments,
  checkOrphanDocumentVersions,
  checkOrphanDocumentChunks,
  checkKbDocumentCountMismatch,
  checkKbTotalChunksMismatch,
  checkDocumentChunkCountMismatch,
  checkStaleProcessingStatus,
  checkDuplicateChunkKeys,
  checkDocumentOwnershipMismatch,
] as const;
