import { sql } from 'drizzle-orm';
import { db } from '@core/db';
import type { CheckResult } from './types';

function extractRows<T>(result: unknown): T[] {
  return (result as [T[]])[0] ?? [];
}

export async function checkOrphanBackfillRuns(): Promise<CheckResult> {
  const name = '16. Orphan document_index_backfill_runs';
  const rows = await db.execute(sql`
    SELECT
      runs.id,
      runs.knowledge_base_id,
      runs.created_by
    FROM document_index_backfill_runs runs
    LEFT JOIN knowledge_bases kb ON runs.knowledge_base_id = kb.id
    LEFT JOIN users u ON runs.created_by = u.id
    WHERE (runs.knowledge_base_id IS NOT NULL AND kb.id IS NULL)
       OR (runs.created_by IS NOT NULL AND u.id IS NULL)
    LIMIT 100
  `);

  const results = extractRows<{
    id: string;
    knowledge_base_id: string | null;
    created_by: string | null;
  }>(rows);

  return {
    name,
    passed: results.length === 0,
    count: results.length,
    details: results.map(
      (row) =>
        `run=${row.id} knowledgeBase=${row.knowledge_base_id ?? 'null'} createdBy=${row.created_by ?? 'null'}`
    ),
  };
}

export async function checkOrphanBackfillItems(): Promise<CheckResult> {
  const name = '17. Orphan document_index_backfill_items';
  const rows = await db.execute(sql`
    SELECT
      items.id,
      items.run_id,
      items.document_id,
      items.user_id,
      items.knowledge_base_id
    FROM document_index_backfill_items items
    LEFT JOIN document_index_backfill_runs runs ON items.run_id = runs.id
    LEFT JOIN documents d ON items.document_id = d.id
    LEFT JOIN users u ON items.user_id = u.id
    LEFT JOIN knowledge_bases kb ON items.knowledge_base_id = kb.id
    WHERE runs.id IS NULL
       OR d.id IS NULL
       OR u.id IS NULL
       OR kb.id IS NULL
    LIMIT 100
  `);

  const results = extractRows<{
    id: string;
    run_id: string;
    document_id: string;
    user_id: string;
    knowledge_base_id: string;
  }>(rows);

  return {
    name,
    passed: results.length === 0,
    count: results.length,
    details: results.map(
      (row) =>
        `item=${row.id} run=${row.run_id} doc=${row.document_id} user=${row.user_id} kb=${row.knowledge_base_id}`
    ),
  };
}
