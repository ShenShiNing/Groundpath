import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

function readEnvFile(filePath: string): Record<string, string> {
  const env: Record<string, string> = {};

  if (!fs.existsSync(filePath)) {
    return env;
  }

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function shouldRunRealIntegration(): boolean {
  if (process.env.RUN_REAL_AUTH_SCHEMA_MIGRATIONS_INTEGRATION === '1') {
    return true;
  }

  const testEnv = readEnvFile(path.resolve(import.meta.dirname, '../../../.env.test.local'));
  return testEnv.RUN_REAL_AUTH_SCHEMA_MIGRATIONS_INTEGRATION === '1';
}

const describeRealIntegration = shouldRunRealIntegration() ? describe : describe.skip;

function getDatabaseUrl(): URL {
  const testEnv = readEnvFile(path.resolve(import.meta.dirname, '../../../.env.test.local'));
  const developmentEnv = readEnvFile(
    path.resolve(import.meta.dirname, '../../../.env.development.local')
  );
  const rawUrl =
    process.env.AUTH_SCHEMA_MIGRATIONS_REAL_DATABASE_URL ??
    testEnv.TEST_DATABASE_URL ??
    testEnv.DATABASE_URL ??
    developmentEnv.DATABASE_URL;

  if (!rawUrl) {
    throw new Error(
      'Real auth schema migration integration test requires AUTH_SCHEMA_MIGRATIONS_REAL_DATABASE_URL or packages/server/.env.development.local'
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

async function expectMysqlError(
  operation: Promise<unknown>,
  code: 'ER_DUP_ENTRY' | 'ER_NO_REFERENCED_ROW_2'
): Promise<void> {
  await expect(operation).rejects.toMatchObject({ code });
}

describeRealIntegration('auth schema migrations integration', () => {
  let adminConnection: Connection;
  let testConnection: Connection;
  let databaseName: string;

  beforeAll(async () => {
    const databaseUrl = getDatabaseUrl();
    databaseName = `gp_migration_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

  it('enforces active user uniqueness while allowing reuse after soft delete', async () => {
    const email = `dupe-${Date.now()}@example.com`;
    const username = `dupe_${Date.now()}`;

    await testConnection.query(
      `
        INSERT INTO users (
          id, username, email, password, status, email_verified, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [randomUUID(), username, email, null, 'active', true]
    );

    await expectMysqlError(
      testConnection.query(
        `
          INSERT INTO users (
            id, username, email, password, status, email_verified, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
        `,
        [randomUUID(), `${username}_other`, email, null, 'active', true]
      ),
      'ER_DUP_ENTRY'
    );

    await expectMysqlError(
      testConnection.query(
        `
          INSERT INTO users (
            id, username, email, password, status, email_verified, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
        `,
        [randomUUID(), username, `other-${email}`, null, 'active', true]
      ),
      'ER_DUP_ENTRY'
    );

    await testConnection.query(
      `UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE email = ? AND deleted_at IS NULL`,
      [email]
    );

    await testConnection.query(
      `
        INSERT INTO users (
          id, username, email, password, status, email_verified, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [randomUUID(), username, email, null, 'active', true]
    );

    const [rows] = await testConnection.query<RowDataPacket[]>(
      `
        SELECT email, username, deleted_at, active_email, active_username
        FROM users
        WHERE email = ?
        ORDER BY deleted_at IS NULL DESC, updated_at DESC
      `,
      [email]
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.active_email).toBe(email);
    expect(rows[0]?.active_username).toBe(username);
    expect(rows[1]?.active_email).toBeNull();
    expect(rows[1]?.active_username).toBeNull();
  });

  it('prevents orphan user_auths rows and cascades cleanup on hard delete', async () => {
    const userId = randomUUID();
    const authId = randomUUID();

    await testConnection.query(
      `
        INSERT INTO users (
          id, username, email, password, status, email_verified, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [userId, `auth_${Date.now()}`, `auth-${Date.now()}@example.com`, null, 'active', true]
    );

    await testConnection.query(
      `
        INSERT INTO user_auths (
          id, user_id, auth_type, auth_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NOW(), NOW())
      `,
      [authId, userId, 'github', `github-${Date.now()}`]
    );

    await expectMysqlError(
      testConnection.query(
        `
          INSERT INTO user_auths (
            id, user_id, auth_type, auth_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, NOW(), NOW())
        `,
        [randomUUID(), randomUUID(), 'github', `orphan-${Date.now()}`]
      ),
      'ER_NO_REFERENCED_ROW_2'
    );

    await testConnection.query(`DELETE FROM users WHERE id = ?`, [userId]);

    const [rows] = await testConnection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM user_auths WHERE id = ?`,
      [authId]
    );

    expect(rows[0]?.count).toBe(0);
  });
});
