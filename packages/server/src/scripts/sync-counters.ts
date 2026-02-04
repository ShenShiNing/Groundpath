/**
 * CLI script to sync knowledge base counters
 *
 * Usage:
 *   pnpm -F @knowledge-agent/server db:sync-counters [options]
 *
 * Options:
 *   --kb <id>    Sync a specific knowledge base
 *   --user <id>  Sync all knowledge bases for a user
 *   --all        Sync all knowledge bases (default)
 *   --dry-run    Show what would be changed without making changes
 *
 * Exit codes:
 *   0 - Success
 *   1 - Error occurred
 *   2 - Knowledge base not found
 */

// Ensure environment is loaded before any imports that depend on it
import { env, isEnvLoaded } from '@shared/config/env';

// Verify environment loaded successfully
if (!isEnvLoaded()) {
  console.error('Error: Environment not loaded. Check .env file exists.');
  process.exit(1);
}

// Verify critical environment variables for CLI
if (!env.DATABASE_URL) {
  console.error('Error: DATABASE_URL not configured.');
  console.error('Make sure .env file exists with DATABASE_URL set.');
  process.exit(1);
}

import { counterSyncService, type SyncResult } from '@modules/knowledge-base';
import { knowledgeBaseRepository } from '@modules/knowledge-base';
import { documentRepository } from '@modules/document';

async function main() {
  const args = process.argv.slice(2);

  const kbId = getArg(args, '--kb');
  const userId = getArg(args, '--user');
  const dryRun = args.includes('--dry-run');
  const syncAll = args.includes('--all') || (!kbId && !userId);

  console.log('Knowledge Base Counter Sync Tool');
  console.log('================================\n');

  if (dryRun) {
    console.log('DRY RUN MODE - No changes will be made\n');
  }

  try {
    if (kbId) {
      console.log(`Syncing knowledge base: ${kbId}\n`);
      if (dryRun) {
        const found = await dryRunSingle(kbId);
        if (!found) {
          console.log('\nKnowledge base not found.');
          process.exit(2);
        }
      } else {
        try {
          const result = await counterSyncService.syncKnowledgeBase(kbId);
          printResult(result);
        } catch (err) {
          if (err instanceof Error && err.message.includes('not found')) {
            console.log(`  [NOT FOUND] ${kbId}`);
            console.log('\nKnowledge base not found.');
            process.exit(2);
          }
          throw err;
        }
      }
    } else if (userId) {
      console.log(`Syncing all knowledge bases for user: ${userId}\n`);
      if (dryRun) {
        const kbs = await knowledgeBaseRepository.listByUser(userId);
        if (kbs.length === 0) {
          console.log('  No knowledge bases found for this user.');
        }
        for (const kb of kbs) {
          await dryRunSingle(kb.id);
        }
        console.log(`\nTotal: ${kbs.length} knowledge bases`);
      } else {
        const results = await counterSyncService.syncUserKnowledgeBases(userId);
        if (results.length === 0) {
          console.log('  No knowledge bases found for this user.');
        } else {
          results.forEach(printResult);
          printSummary(results);
        }
      }
    } else if (syncAll) {
      console.log('Syncing all knowledge bases...\n');
      if (dryRun) {
        const kbs = await knowledgeBaseRepository.listAll();
        for (const kb of kbs) {
          await dryRunSingle(kb.id);
        }
        console.log(`\nTotal: ${kbs.length} knowledge bases`);
      } else {
        const { total, synced, errors } = await counterSyncService.syncAll();
        console.log(`\nSync completed:`);
        console.log(`  Total:  ${total}`);
        console.log(`  Synced: ${synced}`);
        console.log(`  Errors: ${errors}`);
        if (errors > 0) {
          process.exit(1);
        }
      }
    }

    console.log('\nDone.');
    process.exit(0);
  } catch (err) {
    console.error('\nError:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

function getArg(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return undefined;
}

async function dryRunSingle(kbId: string): Promise<boolean> {
  const kb = await knowledgeBaseRepository.findById(kbId);
  if (!kb) {
    console.log(`  [NOT FOUND] ${kbId}`);
    return false;
  }

  const actualDocumentCount = await documentRepository.countByKnowledgeBaseId(kbId);
  const actualTotalChunks = await documentRepository.sumChunksByKnowledgeBaseId(kbId);

  const docChanged = kb.documentCount !== actualDocumentCount;
  const chunksChanged = kb.totalChunks !== actualTotalChunks;

  if (docChanged || chunksChanged) {
    console.log(`  [WOULD CHANGE] ${kb.name} (${kbId})`);
    if (docChanged) {
      console.log(`    documentCount: ${kb.documentCount} -> ${actualDocumentCount}`);
    }
    if (chunksChanged) {
      console.log(`    totalChunks: ${kb.totalChunks} -> ${actualTotalChunks}`);
    }
  } else {
    console.log(`  [OK] ${kb.name} (${kbId})`);
  }

  return true;
}

function printResult(result: SyncResult) {
  const { knowledgeBaseId, name, documentCount, totalChunks } = result;
  const changed = documentCount.changed || totalChunks.changed;

  if (changed) {
    console.log(`  [UPDATED] ${name} (${knowledgeBaseId})`);
    if (documentCount.changed) {
      console.log(`    documentCount: ${documentCount.before} -> ${documentCount.after}`);
    }
    if (totalChunks.changed) {
      console.log(`    totalChunks: ${totalChunks.before} -> ${totalChunks.after}`);
    }
  } else {
    console.log(`  [OK] ${name} (${knowledgeBaseId})`);
  }
}

function printSummary(results: SyncResult[]) {
  const changed = results.filter((r) => r.documentCount.changed || r.totalChunks.changed).length;
  console.log(`\nSummary: ${changed}/${results.length} knowledge bases updated`);
}

main();
