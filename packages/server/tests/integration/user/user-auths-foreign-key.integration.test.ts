import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray, sql } from 'drizzle-orm';

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
  if (process.env.RUN_REAL_USER_AUTHS_FK_INTEGRATION === '1') {
    return true;
  }

  const envFromFile = readEnvFile(path.resolve(import.meta.dirname, '../../../.env.test.local'));
  return envFromFile.RUN_REAL_USER_AUTHS_FK_INTEGRATION === '1';
}

const describeRealIntegration = shouldRunRealIntegration() ? describe : describe.skip;

type DbModule = typeof import('@core/db');
type SchemaModule = typeof import('@core/db/schema');
type AuthChecksModule = typeof import('../../../src/scripts/db-consistency-check/auth.checks');

function extractRows<T>(result: unknown): T[] {
  return (result as [T[]])[0] ?? [];
}

function buildUserFixture(input: { username: string; email: string }) {
  return {
    id: randomUUID(),
    username: input.username,
    email: input.email,
    password: null,
    status: 'active' as const,
    emailVerified: true,
  };
}

function buildUserAuthFixture(input: { userId: string; authType?: 'google' | 'password' }) {
  const suffix = randomUUID().slice(0, 12);

  return {
    id: randomUUID(),
    userId: input.userId,
    authType: input.authType ?? 'google',
    authId: `${input.authType ?? 'google'}-${suffix}`,
  };
}

async function expectMissingUserWrite(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({
    cause: expect.objectContaining({
      code: 'ER_NO_REFERENCED_ROW_2',
    }),
  });
}

async function ensureUserAuthsForeignKey(db: DbModule['db']): Promise<void> {
  const rows = extractRows<{ cnt: number }>(
    await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'user_auths'
        AND CONSTRAINT_NAME = 'user_auths_user_id_fk'
    `)
  );

  if ((rows[0]?.cnt ?? 0) > 0) {
    return;
  }

  await db.execute(sql`
    DELETE ua
    FROM user_auths ua
    LEFT JOIN users u ON u.id = ua.user_id
    WHERE u.id IS NULL
  `);

  await db.execute(sql`
    ALTER TABLE user_auths
    ADD CONSTRAINT user_auths_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE NO ACTION
  `);
}

describeRealIntegration('user_auths foreign key real db integration', () => {
  const originalEnv = { ...process.env };
  const createdUserIds: string[] = [];
  const createdAuthIds: string[] = [];

  let db: DbModule['db'];
  let closeDatabase: DbModule['closeDatabase'];
  let schema: SchemaModule;
  let checkOrphanUserAuths: AuthChecksModule['checkOrphanUserAuths'];

  beforeAll(async () => {
    vi.resetModules();

    const testEnv = readEnvFile(path.resolve(import.meta.dirname, '../../../.env.test.local'));
    const developmentEnv = readEnvFile(
      path.resolve(import.meta.dirname, '../../../.env.development.local')
    );
    const databaseUrl =
      process.env.USER_AUTHS_FK_REAL_DATABASE_URL ??
      testEnv.TEST_DATABASE_URL ??
      testEnv.DATABASE_URL ??
      developmentEnv.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error(
        'Real user_auths FK integration test requires USER_AUTHS_FK_REAL_DATABASE_URL or packages/server/.env.development.local'
      );
    }

    Object.assign(process.env, testEnv, {
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      REDIS_URL:
        testEnv.TEST_REDIS_URL ??
        testEnv.REDIS_URL ??
        developmentEnv.REDIS_URL ??
        'redis://127.0.0.1:6379',
      JWT_SECRET: 'test-jwt-secret-at-least-32-characters-long',
      ENCRYPTION_KEY: 'test-encryption-key-at-least-32-chars',
      EMAIL_VERIFICATION_SECRET: 'test-email-verification-secret',
      LOG_LEVEL: 'silent',
    });

    ({ db, closeDatabase } = await import('@core/db'));
    schema = await import('@core/db/schema');
    ({ checkOrphanUserAuths } =
      await import('../../../src/scripts/db-consistency-check/auth.checks'));
    await ensureUserAuthsForeignKey(db);
  }, 30_000);

  afterEach(async () => {
    if (createdAuthIds.length > 0) {
      await db.delete(schema.userAuths).where(inArray(schema.userAuths.id, [...createdAuthIds]));
      createdAuthIds.length = 0;
    }

    if (createdUserIds.length > 0) {
      await db.delete(schema.users).where(inArray(schema.users.id, [...createdUserIds]));
      createdUserIds.length = 0;
    }
  });

  afterAll(async () => {
    if (closeDatabase) {
      await closeDatabase();
    }

    vi.resetModules();

    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it('rejects auth bindings that reference a missing user', async () => {
    const orphanAuth = buildUserAuthFixture({
      userId: randomUUID(),
      authType: 'google',
    });

    await expectMissingUserWrite(db.insert(schema.userAuths).values(orphanAuth));
  });

  it('cascades auth bindings when the parent user is hard deleted', async () => {
    const suffix = randomUUID().slice(0, 8);
    const user = buildUserFixture({
      username: `auth-cascade-${suffix}`,
      email: `auth-cascade-${suffix}@example.com`,
    });
    const auth = buildUserAuthFixture({
      userId: user.id,
      authType: 'google',
    });

    await db.insert(schema.users).values(user);
    createdUserIds.push(user.id);

    await db.insert(schema.userAuths).values(auth);
    createdAuthIds.push(auth.id);

    await db.delete(schema.users).where(eq(schema.users.id, user.id));
    createdUserIds.splice(createdUserIds.indexOf(user.id), 1);

    const authRows = await db
      .select({ id: schema.userAuths.id })
      .from(schema.userAuths)
      .where(eq(schema.userAuths.id, auth.id));

    expect(authRows).toHaveLength(0);
  });

  it('detects legacy orphan auth bindings in db consistency checks', async () => {
    const orphanAuth = buildUserAuthFixture({
      userId: randomUUID(),
      authType: 'password',
    });

    await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
    try {
      await db.insert(schema.userAuths).values(orphanAuth);
      createdAuthIds.push(orphanAuth.id);
    } finally {
      await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
    }

    const result = await checkOrphanUserAuths();

    expect(result.passed).toBe(false);
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(result.details).toContain(
      `auth=${orphanAuth.id} user=${orphanAuth.userId} type=${orphanAuth.authType} authId=${orphanAuth.authId}`
    );
  });
});
