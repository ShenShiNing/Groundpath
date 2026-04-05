import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import mysql from 'mysql2/promise';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  getRealIntegrationDescribe,
  resolveRealIntegrationEnvValue,
} from '../helpers/real-integration';

const describeRealIntegration = getRealIntegrationDescribe(
  'RUN_REAL_SYSTEM_LOGS_SCHEMA_MIGRATIONS_INTEGRATION'
);

function getDatabaseUrl(): URL {
  const rawUrl = resolveRealIntegrationEnvValue([
    'SYSTEM_LOGS_SCHEMA_MIGRATIONS_REAL_DATABASE_URL',
    'TEST_DATABASE_URL',
    'DATABASE_URL',
  ]);

  if (!rawUrl) {
    throw new Error(
      'Real system_logs schema migration integration test requires SYSTEM_LOGS_SCHEMA_MIGRATIONS_REAL_DATABASE_URL, TEST_DATABASE_URL, DATABASE_URL, or repo root .env.development.local'
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

describeRealIntegration('system_logs schema migrations integration', () => {
  let adminConnection: Connection;
  let testConnection: Connection;
  let databaseName: string;

  beforeAll(async () => {
    const databaseUrl = getDatabaseUrl();
    databaseName = `gp_system_logs_migration_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    adminConnection = await createAdminConnection(databaseUrl);

    await adminConnection.query(`CREATE DATABASE \`${databaseName}\``);

    testConnection = await mysql.createConnection({
      host: databaseUrl.hostname,
      port: databaseUrl.port ? Number(databaseUrl.port) : 3306,
      user: decodeURIComponent(databaseUrl.username),
      password: decodeURIComponent(databaseUrl.password),
      database: databaseName,
      multipleStatements: false,
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

  it('keeps only user and knowledge-base generated columns while preserving metadata filters', async () => {
    const matchedLogId = randomUUID();
    const otherLogId = randomUUID();
    const userId = randomUUID();
    const knowledgeBaseId = randomUUID();

    await testConnection.query(
      `
        INSERT INTO system_logs (
          id, level, category, event, message, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), NOW()), (?, ?, ?, ?, ?, CAST(? AS JSON), NOW())
      `,
      [
        matchedLogId,
        'info',
        'performance',
        'structured_rag.agent_execution',
        'Structured RAG metric log',
        JSON.stringify({
          userId,
          knowledgeBaseId,
          success: true,
          structuredParsed: true,
          finalCitationCount: 3,
        }),
        otherLogId,
        'info',
        'performance',
        'structured_rag.agent_execution',
        'Other metric log',
        JSON.stringify({
          userId: randomUUID(),
          knowledgeBaseId: randomUUID(),
          success: false,
        }),
      ]
    );

    const [generatedColumnRows] = await testConnection.query<RowDataPacket[]>(
      `
        SELECT COLUMN_NAME AS columnName, EXTRA AS extra
        FROM information_schema.COLUMNS
        WHERE table_schema = DATABASE()
          AND table_name = 'system_logs'
          AND EXTRA = 'STORED GENERATED'
        ORDER BY COLUMN_NAME
      `
    );

    expect(generatedColumnRows).toEqual([
      {
        columnName: 'metadata_knowledge_base_id',
        extra: 'STORED GENERATED',
      },
      {
        columnName: 'metadata_user_id',
        extra: 'STORED GENERATED',
      },
    ]);

    const [derivedRows] = await testConnection.query<RowDataPacket[]>(
      `
        SELECT metadata_user_id AS metadataUserId, metadata_knowledge_base_id AS metadataKnowledgeBaseId
        FROM system_logs
        WHERE id = ?
      `,
      [matchedLogId]
    );

    expect(derivedRows).toHaveLength(1);
    expect(derivedRows[0]?.metadataUserId).toBe(userId);
    expect(derivedRows[0]?.metadataKnowledgeBaseId).toBe(knowledgeBaseId);

    const [filteredRows] = await testConnection.query<RowDataPacket[]>(
      `
        SELECT id
        FROM system_logs
        WHERE event = 'structured_rag.agent_execution'
          AND metadata_user_id = ?
          AND metadata_knowledge_base_id = ?
        ORDER BY created_at DESC
      `,
      [userId, knowledgeBaseId]
    );

    expect(filteredRows).toHaveLength(1);
    expect(filteredRows[0]?.id).toBe(matchedLogId);
  });
});
