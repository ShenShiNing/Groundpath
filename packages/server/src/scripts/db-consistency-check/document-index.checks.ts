import { db } from '@core/db';
import { sql, eq, isNull, or } from 'drizzle-orm';
import { documents } from '@core/db/schema/document/documents.schema';
import { documentIndexVersions } from '@core/db/schema/document/document-index-versions.schema';
import { documentNodes } from '@core/db/schema/document/document-nodes.schema';
import type { CheckResult } from './types';

function extractRows<T>(result: unknown): T[] {
  return (result as [T[]])[0] ?? [];
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

export const documentIndexConsistencyChecks = [
  checkActiveIndexVersionMismatch,
  checkOrphanDocumentNodes,
  checkOrphanDocumentEdges,
  checkStaleDocumentIndexBacklog,
] as const;
