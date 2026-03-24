import { db } from '@core/db';
import { sql, eq, and, isNull, isNotNull, count, or, lt } from 'drizzle-orm';
import { documentConfig } from '@core/config/env';
import { documents } from '@core/db/schema/document/documents.schema';
import { documentVersions } from '@core/db/schema/document/document-versions.schema';
import { documentChunks } from '@core/db/schema/document/document-chunks.schema';
import { documentIndexVersions } from '@core/db/schema/document/document-index-versions.schema';
import { documentNodes } from '@core/db/schema/document/document-nodes.schema';
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

async function checkActiveIndexVersionMismatch(): Promise<CheckResult> {
  const name = '9. Active index version mismatch';
  const rows = await db.execute(sql`
    SELECT
      d.id,
      d.title,
      d.active_index_version_id AS pointer,
      piv.status AS pointer_status,
      actual.id AS actual_active_id
    FROM documents d
    LEFT JOIN document_index_versions piv
      ON d.active_index_version_id = piv.id
    LEFT JOIN (
      SELECT document_id, MIN(id) AS id
      FROM document_index_versions
      WHERE status = 'active'
      GROUP BY document_id
    ) actual
      ON d.id = actual.document_id
    WHERE d.deleted_at IS NULL
      AND (
        (d.active_index_version_id IS NOT NULL AND (piv.id IS NULL OR piv.status != 'active'))
        OR COALESCE(d.active_index_version_id, '') != COALESCE(actual.id, '')
      )
  `);

  const results = extractRows<{
    id: string;
    title: string;
    pointer: string | null;
    pointer_status: string | null;
    actual_active_id: string | null;
  }>(rows);

  return {
    name,
    passed: results.length === 0,
    count: results.length,
    details: results.map(
      (row) =>
        `doc=${row.id} "${row.title}" pointer=${row.pointer ?? 'null'} pointerStatus=${row.pointer_status ?? 'null'} actual=${row.actual_active_id ?? 'null'}`
    ),
  };
}

async function checkOrphanDocumentNodes(): Promise<CheckResult> {
  const name = '10. Orphan document_nodes';
  const rows = await db
    .select({
      id: documentNodes.id,
      documentId: documentNodes.documentId,
      indexVersionId: documentNodes.indexVersionId,
    })
    .from(documentNodes)
    .leftJoin(documents, eq(documentNodes.documentId, documents.id))
    .leftJoin(documentIndexVersions, eq(documentNodes.indexVersionId, documentIndexVersions.id))
    .where(or(isNull(documents.id), isNull(documentIndexVersions.id)));

  return {
    name,
    passed: rows.length === 0,
    count: rows.length,
    details: rows.map(
      (row) => `node=${row.id} doc=${row.documentId} indexVersionId=${row.indexVersionId}`
    ),
  };
}

async function checkOrphanDocumentEdges(): Promise<CheckResult> {
  const name = '11. Orphan document_edges';
  const rows = await db.execute(sql`
    SELECT
      e.id,
      e.document_id,
      e.index_version_id,
      e.from_node_id,
      e.to_node_id,
      e.edge_type
    FROM document_edges e
    LEFT JOIN documents d ON e.document_id = d.id
    LEFT JOIN document_index_versions iv ON e.index_version_id = iv.id
    LEFT JOIN document_nodes fn ON e.from_node_id = fn.id
    LEFT JOIN document_nodes tn ON e.to_node_id = tn.id
    WHERE d.id IS NULL
      OR iv.id IS NULL
      OR fn.id IS NULL
      OR tn.id IS NULL
  `);

  const results = extractRows<{
    id: string;
    document_id: string;
    index_version_id: string;
    from_node_id: string;
    to_node_id: string;
    edge_type: string;
  }>(rows);

  return {
    name,
    passed: results.length === 0,
    count: results.length,
    details: results.map(
      (row) =>
        `edge=${row.id} doc=${row.document_id} indexVersionId=${row.index_version_id} from=${row.from_node_id} to=${row.to_node_id} type=${row.edge_type}`
    ),
  };
}

async function checkStaleDocumentIndexBacklog(): Promise<CheckResult> {
  const name = '12. Stale document_index_versions backlog';
  const rows = await db.execute(sql`
    SELECT
      id,
      document_id,
      document_version,
      index_version,
      status,
      built_at
    FROM document_index_versions
    WHERE status IN ('building', 'failed')
      AND built_at < DATE_SUB(NOW(), INTERVAL 1 DAY)
    ORDER BY built_at ASC
    LIMIT 100
  `);

  const results = extractRows<{
    id: string;
    document_id: string;
    document_version: number;
    index_version: string;
    status: string;
    built_at: string;
  }>(rows);

  return {
    name,
    passed: results.length === 0,
    count: results.length,
    details: results.map(
      (row) =>
        `index=${row.id} doc=${row.document_id} v${row.document_version} indexVersion=${row.index_version} status=${row.status} builtAt=${row.built_at}`
    ),
  };
}

async function checkDuplicateActiveUserEmails(): Promise<CheckResult> {
  const name = '13. Duplicate active user emails';
  const rows = await db.execute(sql`
    SELECT
      email,
      COUNT(*) AS cnt,
      GROUP_CONCAT(id ORDER BY created_at SEPARATOR ',') AS user_ids
    FROM users
    WHERE deleted_at IS NULL
    GROUP BY email
    HAVING COUNT(*) > 1
    LIMIT 100
  `);

  const results = extractRows<{
    email: string;
    cnt: number;
    user_ids: string;
  }>(rows);

  return {
    name,
    passed: results.length === 0,
    count: results.length,
    details: results.map((row) => `email=${row.email} count=${row.cnt} users=${row.user_ids}`),
  };
}

async function checkDuplicateActiveUsernames(): Promise<CheckResult> {
  const name = '14. Duplicate active usernames';
  const rows = await db.execute(sql`
    SELECT
      username,
      COUNT(*) AS cnt,
      GROUP_CONCAT(id ORDER BY created_at SEPARATOR ',') AS user_ids
    FROM users
    WHERE deleted_at IS NULL
    GROUP BY username
    HAVING COUNT(*) > 1
    LIMIT 100
  `);

  const results = extractRows<{
    username: string;
    cnt: number;
    user_ids: string;
  }>(rows);

  return {
    name,
    passed: results.length === 0,
    count: results.length,
    details: results.map(
      (row) => `username=${row.username} count=${row.cnt} users=${row.user_ids}`
    ),
  };
}

const checks = [
  checkOrphanDocuments,
  checkOrphanDocumentVersions,
  checkOrphanDocumentChunks,
  checkKbDocumentCountMismatch,
  checkKbTotalChunksMismatch,
  checkDocumentChunkCountMismatch,
  checkStaleProcessingStatus,
  checkDuplicateChunkKeys,
  checkActiveIndexVersionMismatch,
  checkOrphanDocumentNodes,
  checkOrphanDocumentEdges,
  checkStaleDocumentIndexBacklog,
  checkDuplicateActiveUserEmails,
  checkDuplicateActiveUsernames,
] as const;

export async function runDatabaseConsistencyChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const check of checks) {
    results.push(await check());
  }

  return results;
}
