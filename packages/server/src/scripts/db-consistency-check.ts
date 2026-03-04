/**
 * CLI script to check database consistency
 *
 * Usage:
 *   pnpm -F @knowledge-agent/server db:check [options]
 *
 * Options:
 *   --fix    Auto-fix counter mismatches using counterSyncService.syncAll()
 *
 * Exit codes:
 *   0 - All checks passed (or fixed with --fix)
 *   1 - Issues found (or error occurred)
 *
 * Checks performed:
 *   1. Orphan documents (reference non-existent knowledge_bases)
 *   2. Orphan document_versions (reference non-existent documents)
 *   3. Orphan document_chunks (reference non-existent documents)
 *   4. knowledge_bases.documentCount mismatch
 *   5. knowledge_bases.totalChunks mismatch
 *   6. documents.chunkCount mismatch
 *   7. Stale processing/failed status backlog
 *   8. Duplicate document_chunks composite key
 */

// Ensure environment is loaded before any imports that depend on it
import { databaseConfig, isEnvLoaded } from '@shared/config/env';

// Verify environment loaded successfully
if (!isEnvLoaded()) {
  console.error('Error: Environment not loaded. Check .env file exists.');
  process.exit(1);
}

if (!databaseConfig.url) {
  console.error('Error: DATABASE_URL not configured.');
  console.error('Make sure .env file exists with DATABASE_URL set.');
  process.exit(1);
}

import { db } from '@shared/db';
import { sql, eq, and, isNull, count } from 'drizzle-orm';
import { documents } from '@shared/db/schema/document/documents.schema';
import { documentVersions } from '@shared/db/schema/document/document-versions.schema';
import { documentChunks } from '@shared/db/schema/document/document-chunks.schema';
import { knowledgeBases } from '@shared/db/schema/document/knowledge-bases.schema';
import { counterSyncService } from '@modules/knowledge-base';
import { closeDatabase } from '@shared/db';

interface CheckResult {
  name: string;
  passed: boolean;
  count: number;
  details?: string[];
}

async function main() {
  const args = process.argv.slice(2);
  const fix = args.includes('--fix');

  console.log('Database Consistency Check');
  console.log('=========================\n');

  const results: CheckResult[] = [];

  try {
    // Run all 8 checks
    results.push(await checkOrphanDocuments());
    results.push(await checkOrphanDocumentVersions());
    results.push(await checkOrphanDocumentChunks());
    results.push(await checkKbDocumentCountMismatch());
    results.push(await checkKbTotalChunksMismatch());
    results.push(await checkDocumentChunkCountMismatch());
    results.push(await checkStaleProcessingStatus());
    results.push(await checkDuplicateChunkKeys());

    // Print report
    console.log('\n--- Report ---\n');

    let hasIssues = false;
    for (const result of results) {
      const status = result.passed ? '[PASS]' : '[FAIL]';
      console.log(`${status} ${result.name}: ${result.count} issue(s)`);
      if (!result.passed && result.details) {
        for (const detail of result.details.slice(0, 10)) {
          console.log(`       ${detail}`);
        }
        if (result.details.length > 10) {
          console.log(`       ... and ${result.details.length - 10} more`);
        }
      }
      if (!result.passed) hasIssues = true;
    }

    const passed = results.filter((r) => r.passed).length;
    console.log(`\nSummary: ${passed}/${results.length} checks passed`);

    // Fix counter mismatches if requested
    if (fix && hasIssues) {
      console.log('\n--- Fixing counter mismatches ---\n');
      const { total, synced, errors } = await counterSyncService.syncAll();
      console.log(`Counter sync completed: ${synced}/${total} synced, ${errors} errors`);
    }

    await closeDatabase();
    process.exit(hasIssues && !fix ? 1 : 0);
  } catch (err) {
    console.error('\nError:', err instanceof Error ? err.message : err);
    await closeDatabase();
    process.exit(1);
  }
}

// Check 1: Orphan documents (reference non-existent knowledge_bases)
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
    details: rows.map((r) => `doc=${r.id} title="${r.title}" kb=${r.knowledgeBaseId}`),
  };
}

// Check 2: Orphan document_versions (reference non-existent documents)
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
    details: rows.map((r) => `version=${r.id} doc=${r.documentId} v${r.version}`),
  };
}

// Check 3: Orphan document_chunks (reference non-existent documents)
async function checkOrphanDocumentChunks(): Promise<CheckResult> {
  const name = '3. Orphan document_chunks (missing document)';
  const rows = await db
    .select({
      id: documentChunks.id,
      documentId: documentChunks.documentId,
    })
    .from(documentChunks)
    .leftJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(isNull(documents.id));

  return {
    name,
    passed: rows.length === 0,
    count: rows.length,
    details: rows.map((r) => `chunk=${r.id} doc=${r.documentId}`),
  };
}

// Check 4: knowledge_bases.documentCount mismatch
async function checkKbDocumentCountMismatch(): Promise<CheckResult> {
  const name = '4. KB documentCount mismatch';
  const rows = await db.execute(sql`
    SELECT
      kb.id,
      kb.name,
      kb.document_count AS stored,
      COALESCE(actual.cnt, 0) AS actual
    FROM knowledge_bases kb
    LEFT JOIN (
      SELECT knowledge_base_id, COUNT(*) AS cnt
      FROM documents
      WHERE deleted_at IS NULL
      GROUP BY knowledge_base_id
    ) actual ON kb.id = actual.knowledge_base_id
    WHERE kb.deleted_at IS NULL
      AND kb.document_count != COALESCE(actual.cnt, 0)
  `);

  const results = rows[0] as unknown as Array<{
    id: string;
    name: string;
    stored: number;
    actual: number;
  }>;

  return {
    name,
    passed: results.length === 0,
    count: results.length,
    details: results.map((r) => `kb=${r.id} "${r.name}" stored=${r.stored} actual=${r.actual}`),
  };
}

// Check 5: knowledge_bases.totalChunks mismatch
async function checkKbTotalChunksMismatch(): Promise<CheckResult> {
  const name = '5. KB totalChunks mismatch';
  const rows = await db.execute(sql`
    SELECT
      kb.id,
      kb.name,
      kb.total_chunks AS stored,
      COALESCE(actual.total, 0) AS actual
    FROM knowledge_bases kb
    LEFT JOIN (
      SELECT knowledge_base_id, SUM(chunk_count) AS total
      FROM documents
      WHERE deleted_at IS NULL
      GROUP BY knowledge_base_id
    ) actual ON kb.id = actual.knowledge_base_id
    WHERE kb.deleted_at IS NULL
      AND kb.total_chunks != COALESCE(actual.total, 0)
  `);

  const results = rows[0] as unknown as Array<{
    id: string;
    name: string;
    stored: number;
    actual: number;
  }>;

  return {
    name,
    passed: results.length === 0,
    count: results.length,
    details: results.map((r) => `kb=${r.id} "${r.name}" stored=${r.stored} actual=${r.actual}`),
  };
}

// Check 6: documents.chunkCount mismatch with actual document_chunks
async function checkDocumentChunkCountMismatch(): Promise<CheckResult> {
  const name = '6. Document chunkCount mismatch';
  const rows = await db.execute(sql`
    SELECT
      d.id,
      d.title,
      d.chunk_count AS stored,
      COALESCE(actual.cnt, 0) AS actual
    FROM documents d
    LEFT JOIN (
      SELECT document_id, COUNT(*) AS cnt
      FROM document_chunks
      GROUP BY document_id
    ) actual ON d.id = actual.document_id
    WHERE d.deleted_at IS NULL
      AND d.chunk_count != COALESCE(actual.cnt, 0)
  `);

  const results = rows[0] as unknown as Array<{
    id: string;
    title: string;
    stored: number;
    actual: number;
  }>;

  return {
    name,
    passed: results.length === 0,
    count: results.length,
    details: results.map((r) => `doc=${r.id} "${r.title}" stored=${r.stored} actual=${r.actual}`),
  };
}

// Check 7: Stale processing/failed status backlog
async function checkStaleProcessingStatus(): Promise<CheckResult> {
  const name = '7. Stale processing/failed status backlog';

  const processingRows = await db
    .select({ cnt: count() })
    .from(documents)
    .where(and(eq(documents.processingStatus, 'processing'), isNull(documents.deletedAt)));

  const failedRows = await db
    .select({ cnt: count() })
    .from(documents)
    .where(and(eq(documents.processingStatus, 'failed'), isNull(documents.deletedAt)));

  const processingCount = processingRows[0]?.cnt ?? 0;
  const failedCount = failedRows[0]?.cnt ?? 0;
  const totalStale = processingCount + failedCount;

  const details: string[] = [];
  if (processingCount > 0) details.push(`processing: ${processingCount} document(s)`);
  if (failedCount > 0) details.push(`failed: ${failedCount} document(s)`);

  return {
    name,
    passed: totalStale === 0,
    count: totalStale,
    details,
  };
}

// Check 8: Duplicate document_chunks composite key (documentId, version, chunkIndex)
async function checkDuplicateChunkKeys(): Promise<CheckResult> {
  const name = '8. Duplicate document_chunks composite key';
  const rows = await db.execute(sql`
    SELECT
      document_id,
      version,
      chunk_index,
      COUNT(*) AS cnt
    FROM document_chunks
    GROUP BY document_id, version, chunk_index
    HAVING COUNT(*) > 1
    LIMIT 100
  `);

  const results = rows[0] as unknown as Array<{
    document_id: string;
    version: number;
    chunk_index: number;
    cnt: number;
  }>;

  return {
    name,
    passed: results.length === 0,
    count: results.length,
    details: results.map(
      (r) => `doc=${r.document_id} v${r.version} chunk=${r.chunk_index} count=${r.cnt}`
    ),
  };
}

main();
