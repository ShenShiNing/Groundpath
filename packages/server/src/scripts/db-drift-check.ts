import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

interface JournalEntry {
  idx: number;
  tag: string;
}

interface JournalFile {
  entries: JournalEntry[];
}

const require = createRequire(import.meta.url);
const drizzleKitPackageRoot = path.dirname(require.resolve('drizzle-kit'));
const drizzleKitBin = path.join(drizzleKitPackageRoot, 'bin.cjs');
const packageRoot = path.resolve(import.meta.dirname, '../..');
const drizzleDir = path.join(packageRoot, 'drizzle');
const metaDir = path.join(drizzleDir, 'meta');
const drizzleOutPath = 'drizzle';
const schemaPath = 'src/core/db/schema/index.ts';

function toCliPath(input: string): string {
  return input.replace(/\\/g, '/');
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function listSnapshotFiles(dir: string): string[] {
  return fs
    .readdirSync(path.join(dir, 'meta'))
    .filter((file) => /^\d{4}_snapshot\.json$/.test(file))
    .sort();
}

function listMigrationSqlFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
}

function getMissingSnapshotFiles(journal: JournalFile, existingSnapshots: Set<string>): string[] {
  return journal.entries
    .map((entry) => `${entry.tag.split('_')[0]}_snapshot.json`)
    .filter((snapshotFile) => !existingSnapshots.has(snapshotFile));
}

function runDrizzleKit(args: string[], options?: { cwd?: string; silent?: boolean }) {
  const result = spawnSync(process.execPath, [drizzleKitBin, ...args], {
    cwd: options?.cwd ?? packageRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (!options?.silent) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 1) !== 0) {
    throw new Error(`drizzle-kit ${args[0]} failed with exit code ${result.status ?? 1}`);
  }

  return result;
}

function ensureSnapshotCoverage() {
  const journal = readJsonFile<JournalFile>(path.join(metaDir, '_journal.json'));
  const existingSnapshots = new Set(listSnapshotFiles(drizzleDir));
  const missingSnapshots = getMissingSnapshotFiles(journal, existingSnapshots);

  if (missingSnapshots.length > 0) {
    throw new Error(
      `Missing drizzle snapshots for journal entries: ${missingSnapshots.join(', ')}`
    );
  }
}

function ensureNoSchemaDrift() {
  const tempRoot = fs.mkdtempSync(path.join(packageRoot, '.drizzle-drift-'));
  const probeDrizzleDir = path.join(tempRoot, 'drizzle');

  try {
    fs.cpSync(drizzleDir, probeDrizzleDir, { recursive: true });

    const baselineJournal = readJsonFile<JournalFile>(
      path.join(probeDrizzleDir, 'meta', '_journal.json')
    );
    const baselineSqlFiles = new Set(listMigrationSqlFiles(probeDrizzleDir));

    runDrizzleKit([
      'generate',
      '--dialect=mysql',
      `--schema=${toCliPath(schemaPath)}`,
      `--out=${toCliPath(path.relative(packageRoot, probeDrizzleDir))}`,
      '--name=__drift_check__',
    ]);

    const nextJournal = readJsonFile<JournalFile>(
      path.join(probeDrizzleDir, 'meta', '_journal.json')
    );
    const nextSqlFiles = listMigrationSqlFiles(probeDrizzleDir);
    const generatedSqlFiles = nextSqlFiles.filter((file) => !baselineSqlFiles.has(file));

    if (
      nextJournal.entries.length > baselineJournal.entries.length ||
      generatedSqlFiles.length > 0
    ) {
      throw new Error(
        `Schema drift detected. Uncommitted migration output would be generated: ${generatedSqlFiles.join(', ')}`
      );
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function main() {
  console.log('Checking drizzle migration metadata coverage...');
  ensureSnapshotCoverage();

  console.log('Checking drizzle snapshot structure...');
  runDrizzleKit(['check', '--dialect=mysql', `--out=${drizzleOutPath}`]);

  console.log('Checking schema drift against committed migrations...');
  ensureNoSchemaDrift();

  console.log('Drizzle schema and migration metadata are in sync.');
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Drift check failed: ${message}`);
  process.exit(1);
}
