import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  getRealIntegrationDescribe,
  loadRealIntegrationEnv,
} from '../helpers/real-integration';

const describeRealIntegration = getRealIntegrationDescribe('RUN_REAL_USER_UNIQUENESS_INTEGRATION');

type DbModule = typeof import('@core/db');
type SchemaModule = typeof import('@core/db/schema');

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

async function expectDuplicateUserWrite(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({
    cause: expect.objectContaining({
      code: 'ER_DUP_ENTRY',
    }),
  });
}

describeRealIntegration('user soft-delete uniqueness real db integration', () => {
  const originalEnv = { ...process.env };
  const createdUserIds: string[] = [];

  let db: DbModule['db'];
  let closeDatabase: DbModule['closeDatabase'];
  let schema: SchemaModule;

  beforeAll(async () => {
    vi.resetModules();

    const envFromFile = loadRealIntegrationEnv();
    const databaseUrl =
      process.env.USER_UNIQUENESS_REAL_DATABASE_URL ??
      envFromFile.TEST_DATABASE_URL ??
      envFromFile.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error(
        'Real user uniqueness integration test requires USER_UNIQUENESS_REAL_DATABASE_URL or packages/server/.env.development.local'
      );
    }

    Object.assign(process.env, envFromFile, {
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      REDIS_URL:
        envFromFile.TEST_REDIS_URL ??
        envFromFile.REDIS_URL ??
        'redis://127.0.0.1:6379',
      JWT_SECRET: 'test-jwt-secret-at-least-32-characters-long',
      ENCRYPTION_KEY: 'test-encryption-key-at-least-32-chars',
      EMAIL_VERIFICATION_SECRET: 'test-email-verification-secret',
      LOG_LEVEL: 'silent',
    });

    ({ db, closeDatabase } = await import('@core/db'));
    schema = await import('@core/db/schema');
  }, 30_000);

  afterEach(async () => {
    if (createdUserIds.length === 0) {
      return;
    }

    await db.delete(schema.users).where(inArray(schema.users.id, [...createdUserIds]));
    createdUserIds.length = 0;
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

  it('rejects duplicate active email and username at the database layer', async () => {
    const suffix = randomUUID().slice(0, 8);
    const primary = buildUserFixture({
      username: `dup-user-${suffix}`,
      email: `dup-${suffix}@example.com`,
    });

    await db.insert(schema.users).values(primary);
    createdUserIds.push(primary.id);

    await expectDuplicateUserWrite(
      db.insert(schema.users).values(
        buildUserFixture({
          username: `dup-user-alt-${suffix}`,
          email: primary.email,
        })
      )
    );

    await expectDuplicateUserWrite(
      db.insert(schema.users).values(
        buildUserFixture({
          username: primary.username,
          email: `dup-alt-${suffix}@example.com`,
        })
      )
    );
  });

  it('allows reusing email and username after the original user is soft deleted', async () => {
    const suffix = randomUUID().slice(0, 8);
    const username = `reuse-user-${suffix}`;
    const email = `reuse-${suffix}@example.com`;
    const original = buildUserFixture({ username, email });

    await db.insert(schema.users).values(original);
    createdUserIds.push(original.id);

    await db
      .update(schema.users)
      .set({
        deletedAt: new Date('2026-03-24T00:00:00.000Z'),
        deletedBy: original.id,
      })
      .where(eq(schema.users.id, original.id));

    const replacement = buildUserFixture({ username, email });
    await db.insert(schema.users).values(replacement);
    createdUserIds.push(replacement.id);

    const activeUsers = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.email, email),
          eq(schema.users.username, username),
          isNull(schema.users.deletedAt)
        )
      );

    expect(activeUsers).toHaveLength(1);
    expect(activeUsers[0]?.id).toBe(replacement.id);
  });
});
