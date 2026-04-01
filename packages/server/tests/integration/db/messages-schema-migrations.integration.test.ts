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
  'RUN_REAL_MESSAGES_SCHEMA_MIGRATIONS_INTEGRATION'
);
const MESSAGES_CONTENT_FULLTEXT_INDEX = 'messages_content_fulltext_idx';

function getDatabaseUrl(): URL {
  const rawUrl = resolveRealIntegrationEnvValue([
    'MESSAGES_SCHEMA_MIGRATIONS_REAL_DATABASE_URL',
    'TEST_DATABASE_URL',
    'DATABASE_URL',
  ]);

  if (!rawUrl) {
    throw new Error(
      'Real messages schema migration integration test requires MESSAGES_SCHEMA_MIGRATIONS_REAL_DATABASE_URL, TEST_DATABASE_URL, DATABASE_URL, or packages/server/.env.development.local'
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

describeRealIntegration('messages schema migrations integration', () => {
  let adminConnection: Connection;
  let testConnection: Connection;
  let databaseName: string;

  beforeAll(async () => {
    const databaseUrl = getDatabaseUrl();
    databaseName = `gp_messages_migration_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

  it('creates a FULLTEXT index for message content and enables boolean search queries', async () => {
    const userId = randomUUID();
    const conversationId = randomUUID();
    const matchingMessageId = randomUUID();
    const otherMessageId = randomUUID();

    await testConnection.query(
      `
        INSERT INTO users (
          id, username, email, password, status, email_verified, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [userId, `message_${Date.now()}`, `message-${Date.now()}@example.com`, null, 'active', true]
    );

    await testConnection.query(
      `
        INSERT INTO conversations (
          id, user_id, title, created_at, updated_at
        ) VALUES (?, ?, ?, NOW(), NOW())
      `,
      [conversationId, userId, 'Migration verification conversation']
    );

    await testConnection.query(
      `
        INSERT INTO messages (
          id, conversation_id, role, content, created_at
        ) VALUES (?, ?, ?, ?, NOW()), (?, ?, ?, ?, NOW())
      `,
      [
        matchingMessageId,
        conversationId,
        'user',
        'groundpathfulltext verification token appears in this message body',
        otherMessageId,
        conversationId,
        'assistant',
        'This response mentions a different keyword entirely',
      ]
    );

    const [indexRows] = await testConnection.query<RowDataPacket[]>(
      `
        SELECT INDEX_NAME AS indexName, COLUMN_NAME AS columnName, INDEX_TYPE AS indexType
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'messages'
          AND index_name = ?
      `,
      [MESSAGES_CONTENT_FULLTEXT_INDEX]
    );

    expect(indexRows).toHaveLength(1);
    expect(indexRows[0]?.columnName).toBe('content');
    expect(indexRows[0]?.indexType).toBe('FULLTEXT');

    const [searchRows] = await testConnection.query<RowDataPacket[]>(
      `
        SELECT id, MATCH(content) AGAINST (? IN BOOLEAN MODE) AS score
        FROM messages
        WHERE conversation_id = ?
          AND MATCH(content) AGAINST (? IN BOOLEAN MODE) > 0
        ORDER BY score DESC, created_at DESC
      `,
      ['groundpathfulltext*', conversationId, 'groundpathfulltext*']
    );

    expect(searchRows).toHaveLength(1);
    expect(searchRows[0]?.id).toBe(matchingMessageId);
    expect(Number(searchRows[0]?.score ?? 0)).toBeGreaterThan(0);
  });
});
