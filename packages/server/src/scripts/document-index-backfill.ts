/**
 * CLI script to enqueue document-index backfill jobs.
 *
 * Usage:
 *   pnpm -F @knowledge-agent/server document-index:backfill [options]
 *
 * Options:
 *   --kb <id>                Filter by knowledge base ID
 *   --document-type <type>   Filter by document type: pdf|markdown|text|docx|other
 *   --type <type>            Alias for --document-type
 *   --limit <n>              Batch size for this run
 *   --offset <n>             Offset for this run
 *   --include-indexed        Include documents that already have activeIndexVersionId
 *   --include-processing     Include documents currently marked as processing
 *   --run-id <id>            Resume an existing backfill run
 *   --status                 Show status for the latest (or specified) run and exit
 *   --dry-run                Show candidates without enqueueing jobs
 */

import { databaseConfig, isEnvLoaded } from '@shared/config/env';

if (!isEnvLoaded()) {
  console.error('Error: Environment not loaded. Check .env file exists.');
  process.exit(1);
}

if (!databaseConfig.url) {
  console.error('Error: DATABASE_URL not configured.');
  console.error('Make sure .env file exists with DATABASE_URL set.');
  process.exit(1);
}

import { DOCUMENT_TYPES, type DocumentType } from '@knowledge-agent/shared/types';
import { documentIndexBackfillService } from '@modules/document-index';
import { closeDatabase } from '@shared/db';

function getArg(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return undefined;
}

function parseDocumentType(value?: string): DocumentType | undefined {
  if (!value) return undefined;

  if ((DOCUMENT_TYPES as readonly string[]).includes(value)) {
    return value as DocumentType;
  }

  throw new Error(
    `Unsupported document type "${value}". Expected one of: ${DOCUMENT_TYPES.join(', ')}`
  );
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const statusOnly = args.includes('--status');
  const includeIndexed = args.includes('--include-indexed');
  const includeProcessing = args.includes('--include-processing');
  const knowledgeBaseId = getArg(args, '--kb');
  const documentType = parseDocumentType(getArg(args, '--document-type') ?? getArg(args, '--type'));
  const limitArg = getArg(args, '--limit');
  const offsetArg = getArg(args, '--offset');
  const runIdArg = getArg(args, '--run-id');
  const limit = limitArg ? Number(limitArg) : undefined;
  const offset = offsetArg ? Number(offsetArg) : undefined;

  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error('--limit must be a positive integer');
  }

  if (offset !== undefined && (!Number.isInteger(offset) || offset < 0)) {
    throw new Error('--offset must be a non-negative integer');
  }

  console.log('Document Index Backfill Tool');
  console.log('============================\n');

  if (statusOnly) {
    const latest = runIdArg ? undefined : (await documentIndexBackfillService.listRuns(1))[0];
    const run = runIdArg ?? latest?.id;

    if (!run) {
      console.log('No backfill runs found.');
      return;
    }

    const runInfo = await documentIndexBackfillService.getRun(run);
    if (!runInfo) {
      console.log(`Backfill run not found: ${run}`);
      return;
    }

    console.log(`Run ID: ${runInfo.id}`);
    console.log(`Status: ${runInfo.status}`);
    console.log(`Trigger: ${runInfo.trigger}`);
    console.log(`Candidates: ${runInfo.candidateCount}`);
    console.log(
      `Enqueued: ${runInfo.enqueuedCount} | Completed: ${runInfo.completedCount} | Failed: ${runInfo.failedCount} | Skipped: ${runInfo.skippedCount}`
    );
    console.log(`Cursor offset: ${runInfo.cursorOffset}`);
    console.log(`Has more: ${runInfo.hasMore ? 'yes' : 'no'}`);
    if (runInfo.lastError) {
      console.log(`Last error: ${runInfo.lastError}`);
    }
    return;
  }

  if (dryRun) {
    console.log('DRY RUN MODE - No jobs will be enqueued\n');
  }

  const result = await documentIndexBackfillService.enqueueBackfill({
    knowledgeBaseId,
    documentType,
    includeIndexed,
    includeProcessing,
    limit,
    offset,
    dryRun,
    runId: runIdArg,
    trigger: 'manual',
  });

  if (result.runId) {
    console.log(`Run ID: ${result.runId}`);
  }
  console.log(`Selected: ${result.documents.length}`);
  console.log(`Enqueued: ${result.enqueuedCount}`);
  console.log(`Has more: ${result.hasMore ? 'yes' : 'no'}`);
  console.log(`Limit: ${result.limit}`);
  console.log(`Offset: ${result.offset}`);

  if (result.documents.length > 0) {
    console.log('\nDocuments:');
    for (const document of result.documents) {
      console.log(
        `- ${document.id} | user=${document.userId} | kb=${document.knowledgeBaseId} | type=${document.documentType} | version=${document.currentVersion} | indexed=${document.activeIndexVersionId ? 'yes' : 'no'} | status=${document.processingStatus}`
      );
    }
  }
}

main()
  .then(async () => {
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('\nError:', error instanceof Error ? error.message : error);
    await closeDatabase();
    process.exit(1);
  });
