import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { buildRealIntegrationProcessEnv } from './helpers/real-integration';

const packageRoot = path.resolve(import.meta.dirname, '../..');
const vitestArgs = [
  'exec',
  'vitest',
  'run',
  '--maxWorkers=1',
  'tests/integration/db/auth-schema-migrations.integration.test.ts',
  'tests/integration/db/messages-schema-migrations.integration.test.ts',
  'tests/integration/document/document-lifecycle-locks.integration.test.ts',
  'tests/integration/document-index/document-index-lifecycle-consistency.integration.test.ts',
  'tests/integration/document-index/document-index-backfill.db-queue.integration.test.ts',
  'tests/integration/document-index/document-index-backfill.worker-combo.integration.test.ts',
  'tests/integration/document-index/document-index-backfill-foreign-key.integration.test.ts',
  'tests/integration/user/user-auths-foreign-key.integration.test.ts',
  'tests/integration/user/user-soft-delete-uniqueness.integration.test.ts',
];

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(pnpmCommand, vitestArgs, {
  cwd: packageRoot,
  stdio: 'inherit',
  env: buildRealIntegrationProcessEnv(),
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
