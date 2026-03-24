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
  if (process.env.RUN_REAL_BACKFILL_FK_INTEGRATION === '1') {
    return true;
  }

  const envFromFile = readEnvFile(path.resolve(import.meta.dirname, '../../../.env.test.local'));
  return envFromFile.RUN_REAL_BACKFILL_FK_INTEGRATION === '1';
}

const describeRealIntegration = shouldRunRealIntegration() ? describe : describe.skip;

type DbModule = typeof import('@core/db');
type SchemaModule = typeof import('@core/db/schema');
type BackfillChecksModule =
  typeof import('../../../src/scripts/db-consistency-check/backfill.checks');

function extractRows<T>(result: unknown): T[] {
  return (result as [T[]])[0] ?? [];
}

async function hasConstraint(
  db: DbModule['db'],
  tableName: string,
  constraintName: string
): Promise<boolean> {
  const rows = extractRows<{ cnt: number }>(
    await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ${tableName}
        AND CONSTRAINT_NAME = ${constraintName}
    `)
  );

  return (rows[0]?.cnt ?? 0) > 0;
}

async function ensureBackfillForeignKeys(db: DbModule['db']): Promise<void> {
  await db.execute(sql`
    DELETE items
    FROM document_index_backfill_items items
    LEFT JOIN document_index_backfill_runs runs ON items.run_id = runs.id
    LEFT JOIN documents d ON items.document_id = d.id
    LEFT JOIN users u ON items.user_id = u.id
    LEFT JOIN knowledge_bases kb ON items.knowledge_base_id = kb.id
    WHERE runs.id IS NULL
       OR d.id IS NULL
       OR u.id IS NULL
       OR kb.id IS NULL
  `);

  await db.execute(sql`
    DELETE runs
    FROM document_index_backfill_runs runs
    LEFT JOIN knowledge_bases kb ON runs.knowledge_base_id = kb.id
    WHERE runs.knowledge_base_id IS NOT NULL
      AND kb.id IS NULL
  `);

  await db.execute(sql`
    UPDATE document_index_backfill_runs runs
    LEFT JOIN users u ON runs.created_by = u.id
    SET runs.created_by = NULL
    WHERE runs.created_by IS NOT NULL
      AND u.id IS NULL
  `);

  if (
    !(await hasConstraint(
      db,
      'document_index_backfill_runs',
      'document_index_backfill_runs_knowledge_base_id_fk'
    ))
  ) {
    await db.execute(
      sql.raw(`
      ALTER TABLE document_index_backfill_runs
      ADD CONSTRAINT document_index_backfill_runs_knowledge_base_id_fk
      FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id)
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `)
    );
  }

  if (
    !(await hasConstraint(
      db,
      'document_index_backfill_runs',
      'document_index_backfill_runs_created_by_fk'
    ))
  ) {
    await db.execute(
      sql.raw(`
      ALTER TABLE document_index_backfill_runs
      ADD CONSTRAINT document_index_backfill_runs_created_by_fk
      FOREIGN KEY (created_by) REFERENCES users(id)
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `)
    );
  }

  if (
    !(await hasConstraint(
      db,
      'document_index_backfill_items',
      'document_index_backfill_items_run_id_fk'
    ))
  ) {
    await db.execute(
      sql.raw(`
      ALTER TABLE document_index_backfill_items
      ADD CONSTRAINT document_index_backfill_items_run_id_fk
      FOREIGN KEY (run_id) REFERENCES document_index_backfill_runs(id)
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `)
    );
  }

  if (
    !(await hasConstraint(
      db,
      'document_index_backfill_items',
      'document_index_backfill_items_document_id_fk'
    ))
  ) {
    await db.execute(
      sql.raw(`
      ALTER TABLE document_index_backfill_items
      ADD CONSTRAINT document_index_backfill_items_document_id_fk
      FOREIGN KEY (document_id) REFERENCES documents(id)
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `)
    );
  }

  if (
    !(await hasConstraint(
      db,
      'document_index_backfill_items',
      'document_index_backfill_items_user_id_fk'
    ))
  ) {
    await db.execute(
      sql.raw(`
      ALTER TABLE document_index_backfill_items
      ADD CONSTRAINT document_index_backfill_items_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id)
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `)
    );
  }

  if (
    !(await hasConstraint(
      db,
      'document_index_backfill_items',
      'document_index_backfill_items_knowledge_base_id_fk'
    ))
  ) {
    await db.execute(
      sql.raw(`
      ALTER TABLE document_index_backfill_items
      ADD CONSTRAINT document_index_backfill_items_knowledge_base_id_fk
      FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id)
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `)
    );
  }
}

function buildUserFixture(input?: { suffix?: string }) {
  const suffix = input?.suffix ?? randomUUID().slice(0, 8);

  return {
    id: randomUUID(),
    username: `backfill-fk-${suffix}`,
    email: `backfill-fk-${suffix}@example.com`,
    password: null,
    status: 'active' as const,
    emailVerified: true,
  };
}

function buildKnowledgeBaseFixture(input: { userId: string; suffix?: string }) {
  const suffix = input.suffix ?? randomUUID().slice(0, 8);

  return {
    id: randomUUID(),
    userId: input.userId,
    name: `Backfill FK KB ${suffix}`,
    description: 'backfill fk fixture',
    embeddingProvider: 'openai',
    embeddingModel: 'text-embedding-3-small',
    embeddingDimensions: 1536,
    documentCount: 1,
    totalChunks: 0,
    createdBy: input.userId,
    updatedBy: input.userId,
  };
}

function buildDocumentFixture(input: { userId: string; knowledgeBaseId: string }) {
  return {
    id: randomUUID(),
    userId: input.userId,
    knowledgeBaseId: input.knowledgeBaseId,
    title: 'Backfill FK Document',
    description: 'fixture',
    currentVersion: 1,
    activeIndexVersionId: null,
    fileName: 'fixture.md',
    mimeType: 'text/markdown',
    fileSize: 128,
    fileExtension: 'md',
    documentType: 'markdown' as const,
    processingStatus: 'completed' as const,
    processingError: null,
    processingStartedAt: null,
    publishGeneration: 0,
    chunkCount: 0,
    createdBy: input.userId,
    updatedBy: input.userId,
    deletedBy: null,
    deletedAt: null,
  };
}

function buildBackfillRunFixture(input: {
  knowledgeBaseId?: string | null;
  createdBy?: string | null;
}) {
  return {
    id: randomUUID(),
    status: 'running' as const,
    trigger: 'manual' as const,
    knowledgeBaseId: input.knowledgeBaseId ?? null,
    documentType: 'markdown' as const,
    includeIndexed: false,
    includeProcessing: false,
    batchSize: 10,
    enqueueDelayMs: 0,
    candidateCount: 1,
    enqueuedCount: 0,
    completedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    cursorOffset: 0,
    hasMore: false,
    lastError: null,
    completedAt: null,
    createdBy: input.createdBy ?? null,
  };
}

function buildBackfillItemFixture(input: {
  runId: string;
  documentId: string;
  userId: string;
  knowledgeBaseId: string;
}) {
  return {
    id: randomUUID(),
    runId: input.runId,
    documentId: input.documentId,
    userId: input.userId,
    knowledgeBaseId: input.knowledgeBaseId,
    documentVersion: 1,
    status: 'pending' as const,
    jobId: null,
    error: null,
    enqueuedAt: null,
    completedAt: null,
  };
}

async function expectMissingParentWrite(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({
    cause: expect.objectContaining({
      code: 'ER_NO_REFERENCED_ROW_2',
    }),
  });
}

describeRealIntegration('document index backfill foreign key real db integration', () => {
  const originalEnv = { ...process.env };
  const createdRunIds: string[] = [];
  const createdItemIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const createdKnowledgeBaseIds: string[] = [];
  const createdUserIds: string[] = [];

  let db: DbModule['db'];
  let closeDatabase: DbModule['closeDatabase'];
  let schema: SchemaModule;
  let checkOrphanBackfillRuns: BackfillChecksModule['checkOrphanBackfillRuns'];
  let checkOrphanBackfillItems: BackfillChecksModule['checkOrphanBackfillItems'];

  beforeAll(async () => {
    vi.resetModules();

    const testEnv = readEnvFile(path.resolve(import.meta.dirname, '../../../.env.test.local'));
    const developmentEnv = readEnvFile(
      path.resolve(import.meta.dirname, '../../../.env.development.local')
    );
    const databaseUrl =
      process.env.BACKFILL_FK_REAL_DATABASE_URL ??
      testEnv.TEST_DATABASE_URL ??
      testEnv.DATABASE_URL ??
      developmentEnv.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error(
        'Real backfill FK integration test requires BACKFILL_FK_REAL_DATABASE_URL or packages/server/.env.development.local'
      );
    }

    Object.assign(process.env, {
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
    ({ checkOrphanBackfillRuns, checkOrphanBackfillItems } =
      await import('../../../src/scripts/db-consistency-check/backfill.checks'));
    await ensureBackfillForeignKeys(db);
  }, 30_000);

  afterEach(async () => {
    if (createdItemIds.length > 0) {
      await db
        .delete(schema.documentIndexBackfillItems)
        .where(inArray(schema.documentIndexBackfillItems.id, [...createdItemIds]));
      createdItemIds.length = 0;
    }

    if (createdRunIds.length > 0) {
      await db
        .delete(schema.documentIndexBackfillRuns)
        .where(inArray(schema.documentIndexBackfillRuns.id, [...createdRunIds]));
      createdRunIds.length = 0;
    }

    if (createdDocumentIds.length > 0) {
      await db
        .delete(schema.documents)
        .where(inArray(schema.documents.id, [...createdDocumentIds]));
      createdDocumentIds.length = 0;
    }

    if (createdKnowledgeBaseIds.length > 0) {
      await db
        .delete(schema.knowledgeBases)
        .where(inArray(schema.knowledgeBases.id, [...createdKnowledgeBaseIds]));
      createdKnowledgeBaseIds.length = 0;
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

  it('rejects backfill runs and items that reference missing parents', async () => {
    const user = buildUserFixture();
    const knowledgeBase = buildKnowledgeBaseFixture({ userId: user.id });
    const document = buildDocumentFixture({ userId: user.id, knowledgeBaseId: knowledgeBase.id });

    await db.insert(schema.users).values(user);
    createdUserIds.push(user.id);
    await db.insert(schema.knowledgeBases).values(knowledgeBase);
    createdKnowledgeBaseIds.push(knowledgeBase.id);
    await db.insert(schema.documents).values(document);
    createdDocumentIds.push(document.id);

    await expectMissingParentWrite(
      db
        .insert(schema.documentIndexBackfillRuns)
        .values(buildBackfillRunFixture({ knowledgeBaseId: randomUUID(), createdBy: user.id }))
    );

    await expectMissingParentWrite(
      db
        .insert(schema.documentIndexBackfillRuns)
        .values(
          buildBackfillRunFixture({ knowledgeBaseId: knowledgeBase.id, createdBy: randomUUID() })
        )
    );

    const run = buildBackfillRunFixture({ knowledgeBaseId: knowledgeBase.id, createdBy: user.id });
    await db.insert(schema.documentIndexBackfillRuns).values(run);
    createdRunIds.push(run.id);

    await expectMissingParentWrite(
      db.insert(schema.documentIndexBackfillItems).values(
        buildBackfillItemFixture({
          runId: randomUUID(),
          documentId: document.id,
          userId: user.id,
          knowledgeBaseId: knowledgeBase.id,
        })
      )
    );

    await expectMissingParentWrite(
      db.insert(schema.documentIndexBackfillItems).values(
        buildBackfillItemFixture({
          runId: run.id,
          documentId: randomUUID(),
          userId: user.id,
          knowledgeBaseId: knowledgeBase.id,
        })
      )
    );

    await expectMissingParentWrite(
      db.insert(schema.documentIndexBackfillItems).values(
        buildBackfillItemFixture({
          runId: run.id,
          documentId: document.id,
          userId: randomUUID(),
          knowledgeBaseId: knowledgeBase.id,
        })
      )
    );

    await expectMissingParentWrite(
      db.insert(schema.documentIndexBackfillItems).values(
        buildBackfillItemFixture({
          runId: run.id,
          documentId: document.id,
          userId: user.id,
          knowledgeBaseId: randomUUID(),
        })
      )
    );
  });

  it('cascades knowledge-base scoped backfill history and nulls createdBy when the creator is deleted', async () => {
    const creator = buildUserFixture({ suffix: 'creator' });
    await db.insert(schema.users).values(creator);
    createdUserIds.push(creator.id);

    const creatorRun = buildBackfillRunFixture({ knowledgeBaseId: null, createdBy: creator.id });
    await db.insert(schema.documentIndexBackfillRuns).values(creatorRun);
    createdRunIds.push(creatorRun.id);

    await db.delete(schema.users).where(eq(schema.users.id, creator.id));
    createdUserIds.splice(createdUserIds.indexOf(creator.id), 1);

    const creatorRunRows = await db
      .select({ createdBy: schema.documentIndexBackfillRuns.createdBy })
      .from(schema.documentIndexBackfillRuns)
      .where(eq(schema.documentIndexBackfillRuns.id, creatorRun.id));

    expect(creatorRunRows).toEqual([{ createdBy: null }]);

    const user = buildUserFixture({ suffix: 'scoped' });
    await db.insert(schema.users).values(user);
    createdUserIds.push(user.id);

    const knowledgeBase = buildKnowledgeBaseFixture({ userId: user.id, suffix: 'scoped' });
    await db.insert(schema.knowledgeBases).values(knowledgeBase);
    createdKnowledgeBaseIds.push(knowledgeBase.id);

    const document = buildDocumentFixture({ userId: user.id, knowledgeBaseId: knowledgeBase.id });
    await db.insert(schema.documents).values(document);
    createdDocumentIds.push(document.id);

    const run = buildBackfillRunFixture({ knowledgeBaseId: knowledgeBase.id, createdBy: user.id });
    await db.insert(schema.documentIndexBackfillRuns).values(run);
    createdRunIds.push(run.id);

    const item = buildBackfillItemFixture({
      runId: run.id,
      documentId: document.id,
      userId: user.id,
      knowledgeBaseId: knowledgeBase.id,
    });
    await db.insert(schema.documentIndexBackfillItems).values(item);
    createdItemIds.push(item.id);

    await db.delete(schema.knowledgeBases).where(eq(schema.knowledgeBases.id, knowledgeBase.id));
    createdKnowledgeBaseIds.splice(createdKnowledgeBaseIds.indexOf(knowledgeBase.id), 1);
    createdDocumentIds.splice(createdDocumentIds.indexOf(document.id), 1);
    createdRunIds.splice(createdRunIds.indexOf(run.id), 1);
    createdItemIds.splice(createdItemIds.indexOf(item.id), 1);

    const runRows = await db
      .select({ id: schema.documentIndexBackfillRuns.id })
      .from(schema.documentIndexBackfillRuns)
      .where(eq(schema.documentIndexBackfillRuns.id, run.id));
    const itemRows = await db
      .select({ id: schema.documentIndexBackfillItems.id })
      .from(schema.documentIndexBackfillItems)
      .where(eq(schema.documentIndexBackfillItems.id, item.id));

    expect(runRows).toHaveLength(0);
    expect(itemRows).toHaveLength(0);
  });

  it('detects legacy orphan backfill rows in db consistency checks', async () => {
    const orphanRunId = randomUUID();
    const orphanItemId = randomUUID();

    await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
    try {
      await db.insert(schema.documentIndexBackfillRuns).values({
        ...buildBackfillRunFixture({
          knowledgeBaseId: randomUUID(),
          createdBy: randomUUID(),
        }),
        id: orphanRunId,
      });
      createdRunIds.push(orphanRunId);

      await db.insert(schema.documentIndexBackfillItems).values({
        ...buildBackfillItemFixture({
          runId: orphanRunId,
          documentId: randomUUID(),
          userId: randomUUID(),
          knowledgeBaseId: randomUUID(),
        }),
        id: orphanItemId,
      });
      createdItemIds.push(orphanItemId);
    } finally {
      await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
    }

    const runResult = await checkOrphanBackfillRuns();
    const itemResult = await checkOrphanBackfillItems();

    expect(runResult.passed).toBe(false);
    expect(runResult.details).toEqual(
      expect.arrayContaining([expect.stringContaining(`run=${orphanRunId} knowledgeBase=`)])
    );
    expect(itemResult.passed).toBe(false);
    expect(itemResult.details).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`item=${orphanItemId} run=${orphanRunId}`),
      ])
    );
  });
});
