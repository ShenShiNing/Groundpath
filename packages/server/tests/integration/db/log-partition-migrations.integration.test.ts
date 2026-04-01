import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  getRealIntegrationDescribe,
  loadRealIntegrationEnv,
} from '../helpers/real-integration';

const describeRealIntegration = getRealIntegrationDescribe(
  'RUN_REAL_LOG_PARTITION_MIGRATIONS_INTEGRATION'
);

function getDatabaseUrl(): URL {
  const envFromFile = loadRealIntegrationEnv();
  const rawUrl =
    process.env.LOG_PARTITION_MIGRATIONS_REAL_DATABASE_URL ??
    envFromFile.TEST_DATABASE_URL ??
    envFromFile.DATABASE_URL;

  if (!rawUrl) {
    throw new Error(
      'Real log partition migration integration test requires LOG_PARTITION_MIGRATIONS_REAL_DATABASE_URL or packages/server/.env.development.local'
    );
  }

  return new URL(rawUrl);
}

function createAdminConnection(databaseUrl: URL) {
  return mysql.createConnection({
    host: databaseUrl.hostname,
    port: databaseUrl.port ? Number(databaseUrl.port) : 3306,
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    multipleStatements: false,
    timezone: 'Z',
  });
}

function splitSqlStatements(sqlContent: string): string[] {
  return sqlContent
    .split(/--> statement-breakpoint\s*/g)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function applyProjectMigrations(connection: Connection): Promise<void> {
  const drizzleDir = path.resolve(import.meta.dirname, '../../../drizzle');
  const migrationFiles = fs
    .readdirSync(drizzleDir)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();

  for (const migrationFile of migrationFiles) {
    const sqlContent = fs.readFileSync(path.join(drizzleDir, migrationFile), 'utf8');
    const statements = splitSqlStatements(sqlContent);

    for (const statement of statements) {
      await connection.query(statement);
    }
  }
}

describeRealIntegration('log partition migrations integration', () => {
  let adminConnection: Connection;
  let testConnection: Connection;
  let databaseName: string;

  beforeAll(async () => {
    const databaseUrl = getDatabaseUrl();
    databaseName = `gp_log_partition_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    adminConnection = await createAdminConnection(databaseUrl);

    await adminConnection.query(`CREATE DATABASE \`${databaseName}\``);

    testConnection = await mysql.createConnection({
      host: databaseUrl.hostname,
      port: databaseUrl.port ? Number(databaseUrl.port) : 3306,
      user: decodeURIComponent(databaseUrl.username),
      password: decodeURIComponent(databaseUrl.password),
      database: databaseName,
      multipleStatements: false,
      timezone: 'Z',
    });

    await applyProjectMigrations(testConnection);
  }, 30_000);

  afterAll(async () => {
    if (testConnection) {
      await testConnection.end();
    }

    if (adminConnection) {
      await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
      await adminConnection.end();
    }
  });

  it('partitions login_logs and operation_logs by created_at with composite primary keys', async () => {
    const [partitionRows] = await testConnection.query<RowDataPacket[]>(
      `
        SELECT table_name AS tableName, partition_name AS partitionName
        FROM information_schema.partitions
        WHERE table_schema = DATABASE()
          AND table_name IN ('login_logs', 'operation_logs')
          AND partition_name IS NOT NULL
        ORDER BY table_name, partition_ordinal_position
      `
    );

    const partitionsByTable = new Map<string, string[]>();
    for (const row of partitionRows) {
      const tableName = String(row.tableName);
      const partitionName = String(row.partitionName);
      const partitions = partitionsByTable.get(tableName) ?? [];
      partitions.push(partitionName);
      partitionsByTable.set(tableName, partitions);
    }

    for (const tableName of ['login_logs', 'operation_logs']) {
      const partitionNames = partitionsByTable.get(tableName) ?? [];

      expect(partitionNames).toContain('p_legacy');
      expect(partitionNames).toContain('pmax');
      expect(partitionNames.some((partitionName) => /^p\d{6}$/.test(partitionName))).toBe(true);
    }

    const [primaryKeyRows] = await testConnection.query<RowDataPacket[]>(
      `
        SELECT table_name AS tableName, column_name AS columnName, ordinal_position AS ordinalPosition
        FROM information_schema.key_column_usage
        WHERE table_schema = DATABASE()
          AND table_name IN ('login_logs', 'operation_logs')
          AND constraint_name = 'PRIMARY'
        ORDER BY table_name, ordinal_position
      `
    );

    const primaryKeyColumnsByTable = new Map<string, string[]>();
    for (const row of primaryKeyRows) {
      const tableName = String(row.tableName);
      const columnName = String(row.columnName);
      const columns = primaryKeyColumnsByTable.get(tableName) ?? [];
      columns.push(columnName);
      primaryKeyColumnsByTable.set(tableName, columns);
    }

    expect(primaryKeyColumnsByTable.get('login_logs')).toEqual(['id', 'created_at']);
    expect(primaryKeyColumnsByTable.get('operation_logs')).toEqual(['id', 'created_at']);

    const [showCreateRows] = await testConnection.query<RowDataPacket[]>(`SHOW CREATE TABLE login_logs`);
    const createTableSql = String(showCreateRows[0]?.['Create Table'] ?? '');

    expect(createTableSql).toMatch(/PARTITION BY RANGE \(unix_timestamp\(`created_at`\)\)/i);
  });
});
