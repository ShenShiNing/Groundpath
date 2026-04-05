import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  getRealIntegrationDescribe,
  resolveRealIntegrationEnvValue,
} from '../helpers/real-integration';

const describeRealIntegration = getRealIntegrationDescribe(
  'RUN_REAL_DOCUMENT_SCHEMA_MIGRATIONS_INTEGRATION'
);

function getDatabaseUrl(): URL {
  const rawUrl = resolveRealIntegrationEnvValue([
    'DOCUMENT_SCHEMA_MIGRATIONS_REAL_DATABASE_URL',
    'TEST_DATABASE_URL',
    'DATABASE_URL',
  ]);

  if (!rawUrl) {
    throw new Error(
      'Real document schema migration integration test requires DOCUMENT_SCHEMA_MIGRATIONS_REAL_DATABASE_URL, TEST_DATABASE_URL, DATABASE_URL, or repo root .env.development.local'
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

async function getConstraintCount(
  connection: Connection,
  tableName: string,
  constraintName: string
): Promise<number> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = ?
    `,
    [tableName, constraintName]
  );

  return Number(rows[0]?.count ?? 0);
}

async function expectMysqlError(
  operation: Promise<unknown>,
  code: 'ER_NO_REFERENCED_ROW_2' | 'ER_ROW_IS_REFERENCED_2'
): Promise<void> {
  await expect(operation).rejects.toMatchObject({ code });
}

describeRealIntegration('document schema migrations integration', () => {
  let adminConnection: Connection;
  let testConnection: Connection;
  let databaseName: string;

  beforeAll(async () => {
    const databaseUrl = getDatabaseUrl();
    databaseName = `gp_document_migration_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

  it('removes documents_user_id_fk while preserving ownership constraints that still need orchestration', async () => {
    expect(await getConstraintCount(testConnection, 'documents', 'documents_user_id_fk')).toBe(0);
    expect(
      await getConstraintCount(testConnection, 'documents', 'documents_knowledge_base_id_fk')
    ).toBe(1);
    expect(
      await getConstraintCount(testConnection, 'knowledge_bases', 'knowledge_bases_user_id_fk')
    ).toBe(1);
    expect(
      await getConstraintCount(testConnection, 'conversations', 'conversations_user_id_fk')
    ).toBe(1);
  });

  it('still enforces knowledge base parentage for documents after migration replay', async () => {
    const userId = randomUUID();
    const knowledgeBaseId = randomUUID();
    const validDocumentId = randomUUID();

    await testConnection.query(
      `
        INSERT INTO users (
          id, username, email, password, status, email_verified, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        userId,
        `doc-migration-${Date.now()}`,
        `doc-migration-${Date.now()}@example.com`,
        null,
        'active',
        true,
      ]
    );

    await testConnection.query(
      `
        INSERT INTO knowledge_bases (
          id, user_id, name, description, embedding_provider, embedding_model, embedding_dimensions,
          document_count, total_chunks, created_by, created_at, updated_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW())
      `,
      [
        knowledgeBaseId,
        userId,
        'Document Migration KB',
        'fixture',
        'openai',
        'text-embedding-3-small',
        1536,
        0,
        0,
        userId,
        userId,
      ]
    );

    await testConnection.query(
      `
        INSERT INTO documents (
          id, user_id, knowledge_base_id, title, description, current_version, active_index_version_id,
          file_name, mime_type, file_size, file_extension, document_type, processing_status,
          processing_error, processing_started_at, publish_generation, chunk_count,
          created_by, created_at, updated_by, updated_at, deleted_by, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW(), ?, ?)
      `,
      [
        validDocumentId,
        userId,
        knowledgeBaseId,
        'Migration Fixture',
        'fixture',
        1,
        null,
        'fixture.md',
        'text/markdown',
        128,
        'md',
        'markdown',
        'completed',
        null,
        null,
        0,
        0,
        userId,
        userId,
        null,
        null,
      ]
    );

    await expectMysqlError(
      testConnection.query(
        `
          INSERT INTO documents (
            id, user_id, knowledge_base_id, title, description, current_version, active_index_version_id,
            file_name, mime_type, file_size, file_extension, document_type, processing_status,
            processing_error, processing_started_at, publish_generation, chunk_count,
            created_by, created_at, updated_by, updated_at, deleted_by, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW(), ?, ?)
        `,
        [
          randomUUID(),
          userId,
          randomUUID(),
          'Missing KB',
          'fixture',
          1,
          null,
          'missing.md',
          'text/markdown',
          128,
          'md',
          'markdown',
          'completed',
          null,
          null,
          0,
          0,
          userId,
          userId,
          null,
          null,
        ]
      ),
      'ER_NO_REFERENCED_ROW_2'
    );
  });

  it('still blocks deleting a user who owns knowledge bases', async () => {
    const suffix = randomUUID().slice(0, 8);
    const userId = randomUUID();
    const knowledgeBaseId = randomUUID();

    await testConnection.query(
      `
        INSERT INTO users (
          id, username, email, password, status, email_verified, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [userId, `kb-owner-${suffix}`, `kb-owner-${suffix}@example.com`, null, 'active', true]
    );

    await testConnection.query(
      `
        INSERT INTO knowledge_bases (
          id, user_id, name, description, embedding_provider, embedding_model, embedding_dimensions,
          document_count, total_chunks, created_by, created_at, updated_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW())
      `,
      [
        knowledgeBaseId,
        userId,
        'User Delete Boundary KB',
        'fixture',
        'openai',
        'text-embedding-3-small',
        1536,
        0,
        0,
        userId,
        userId,
      ]
    );

    await expectMysqlError(
      testConnection.query(`DELETE FROM users WHERE id = ?`, [userId]),
      'ER_ROW_IS_REFERENCED_2'
    );
  });

  it('still blocks deleting a user who owns standalone conversations', async () => {
    const suffix = randomUUID().slice(0, 8);
    const userId = randomUUID();
    const conversationId = randomUUID();

    await testConnection.query(
      `
        INSERT INTO users (
          id, username, email, password, status, email_verified, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        userId,
        `conversation-owner-${suffix}`,
        `conversation-owner-${suffix}@example.com`,
        null,
        'active',
        true,
      ]
    );

    await testConnection.query(
      `
        INSERT INTO conversations (
          id, user_id, knowledge_base_id, title, created_by, created_at, updated_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, NOW(), ?, NOW())
      `,
      [conversationId, userId, null, 'Standalone Conversation', userId, userId]
    );

    await expectMysqlError(
      testConnection.query(`DELETE FROM users WHERE id = ?`, [userId]),
      'ER_ROW_IS_REFERENCED_2'
    );
  });

  it('enforces a single active scheduled backfill run while allowing completed or manual runs', async () => {
    const runningScheduledRunId = randomUUID();
    const duplicateScheduledRunId = randomUUID();
    const completedScheduledRunId = randomUUID();
    const manualRunId = randomUUID();

    await testConnection.query(
      `
        INSERT INTO document_index_backfill_runs (
          id, status, \`trigger\`, batch_size, enqueue_delay_ms
        ) VALUES (?, ?, ?, ?, ?)
      `,
      [runningScheduledRunId, 'running', 'scheduled', 50, 0]
    );

    await expect(
      testConnection.query(
        `
          INSERT INTO document_index_backfill_runs (
            id, status, \`trigger\`, batch_size, enqueue_delay_ms
          ) VALUES (?, ?, ?, ?, ?)
        `,
        [duplicateScheduledRunId, 'draining', 'scheduled', 50, 0]
      )
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });

    await testConnection.query(
      `
        INSERT INTO document_index_backfill_runs (
          id, status, \`trigger\`, batch_size, enqueue_delay_ms
        ) VALUES (?, ?, ?, ?, ?)
      `,
      [completedScheduledRunId, 'completed', 'scheduled', 50, 0]
    );

    await testConnection.query(
      `
        INSERT INTO document_index_backfill_runs (
          id, status, \`trigger\`, batch_size, enqueue_delay_ms
        ) VALUES (?, ?, ?, ?, ?)
      `,
      [manualRunId, 'running', 'manual', 50, 0]
    );

    const [rows] = await testConnection.query<RowDataPacket[]>(
      `
        SELECT id, active_scheduled_slot AS activeScheduledSlot
        FROM document_index_backfill_runs
        WHERE id IN (?, ?, ?)
        ORDER BY id ASC
      `,
      [runningScheduledRunId, completedScheduledRunId, manualRunId]
    );

    const slotById = new Map(
      rows.map((row) => [String(row.id), row.activeScheduledSlot as string | null])
    );
    expect(slotById.get(runningScheduledRunId)).toBe('scheduled');
    expect(slotById.get(completedScheduledRunId)).toBeNull();
    expect(slotById.get(manualRunId)).toBeNull();
  });
});
