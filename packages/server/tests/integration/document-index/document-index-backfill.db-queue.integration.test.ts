import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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
  if (process.env.RUN_REAL_BACKFILL_INTEGRATION === '1') {
    return true;
  }

  const testEnv = readEnvFile(path.resolve(import.meta.dirname, '../../../.env.test.local'));
  return testEnv.RUN_REAL_BACKFILL_INTEGRATION === '1';
}

const describeRealIntegration = shouldRunRealIntegration() ? describe : describe.skip;

describeRealIntegration('document index backfill real db/queue integration', () => {
  const originalEnv = { ...process.env };
  const queuePrefix = `ka-backfill-int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const userId = randomUUID();
  const knowledgeBaseId = randomUUID();
  const firstDocumentId = randomUUID();
  const secondDocumentId = randomUUID();
  const createdIds = {
    userId,
    knowledgeBaseId,
    documentIds: [firstDocumentId, secondDocumentId] as const,
  };

  let db: typeof import('@core/db').db;
  let closeDatabase: typeof import('@core/db').closeDatabase;
  let documentIndexBackfillService: typeof import('@modules/document-index/services/document-index-backfill.service').documentIndexBackfillService;
  let documentProcessingQueue: typeof import('@modules/rag/queue/document-processing.queue').documentProcessingQueue;
  let schema: typeof import('@core/db/schema');
  let drizzle: typeof import('drizzle-orm');

  beforeAll(async () => {
    vi.resetModules();

    const envFromFile = readEnvFile(
      path.resolve(import.meta.dirname, '../../../.env.development.local')
    );
    const databaseUrl = process.env.BACKFILL_REAL_DATABASE_URL ?? envFromFile.DATABASE_URL;
    const redisUrl = process.env.BACKFILL_REAL_REDIS_URL ?? envFromFile.REDIS_URL;

    if (!databaseUrl || !redisUrl) {
      throw new Error(
        'Real backfill integration test requires BACKFILL_REAL_DATABASE_URL/BACKFILL_REAL_REDIS_URL or packages/server/.env.development.local'
      );
    }

    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      REDIS_PREFIX: queuePrefix,
      JWT_SECRET: 'test-jwt-secret-at-least-32-characters-long',
      ENCRYPTION_KEY: 'test-encryption-key-at-least-32-chars',
      EMAIL_VERIFICATION_SECRET: 'test-email-verification-secret',
      LOG_LEVEL: 'silent',
    });

    ({ db, closeDatabase } = await import('@core/db'));
    ({ documentIndexBackfillService } =
      await import('@modules/document-index/services/document-index-backfill.service'));
    ({ documentProcessingQueue } = await import('@modules/rag/queue/document-processing.queue'));
    schema = await import('@core/db/schema');
    drizzle = await import('drizzle-orm');

    const now = new Date();
    await db.insert(schema.users).values({
      id: createdIds.userId,
      username: `backfill-int-${queuePrefix}`,
      email: `backfill-int-${queuePrefix}@example.com`,
      password: null,
      status: 'active',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.knowledgeBases).values({
      id: createdIds.knowledgeBaseId,
      userId: createdIds.userId,
      name: `Backfill Integration ${queuePrefix}`,
      description: 'real db/queue integration fixture',
      embeddingProvider: 'openai',
      embeddingModel: 'text-embedding-3-small',
      embeddingDimensions: 1536,
      documentCount: 2,
      totalChunks: 0,
      createdBy: createdIds.userId,
      updatedBy: createdIds.userId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.documents).values([
      {
        id: firstDocumentId,
        userId: createdIds.userId,
        knowledgeBaseId: createdIds.knowledgeBaseId,
        title: 'Older Backfill Candidate',
        description: 'integration fixture',
        currentVersion: 1,
        activeIndexVersionId: null,
        fileName: 'older.md',
        mimeType: 'text/markdown',
        fileSize: 12,
        fileExtension: 'md',
        documentType: 'markdown',
        processingStatus: 'completed',
        chunkCount: 0,
        createdBy: createdIds.userId,
        updatedBy: createdIds.userId,
        createdAt: new Date('2026-03-10T00:00:00.000Z'),
        updatedAt: new Date('2026-03-10T00:00:00.000Z'),
      },
      {
        id: secondDocumentId,
        userId: createdIds.userId,
        knowledgeBaseId: createdIds.knowledgeBaseId,
        title: 'Newer Backfill Candidate',
        description: 'integration fixture',
        currentVersion: 1,
        activeIndexVersionId: null,
        fileName: 'newer.md',
        mimeType: 'text/markdown',
        fileSize: 18,
        fileExtension: 'md',
        documentType: 'markdown',
        processingStatus: 'completed',
        chunkCount: 0,
        createdBy: createdIds.userId,
        updatedBy: createdIds.userId,
        createdAt: new Date('2026-03-11T00:00:00.000Z'),
        updatedAt: new Date('2026-03-11T00:00:00.000Z'),
      },
    ]);
  });

  afterAll(async () => {
    if (documentProcessingQueue) {
      try {
        await documentProcessingQueue.obliterate({ force: true });
      } catch {
        // Ignore queue cleanup failures to preserve DB cleanup.
      }
      await documentProcessingQueue.close();
    }

    if (db && schema && drizzle) {
      const { eq, inArray } = drizzle;

      await db
        .delete(schema.documentIndexBackfillItems)
        .where(inArray(schema.documentIndexBackfillItems.documentId, createdIds.documentIds));
      await db
        .delete(schema.documentIndexBackfillRuns)
        .where(eq(schema.documentIndexBackfillRuns.knowledgeBaseId, createdIds.knowledgeBaseId));
      await db.delete(schema.documents).where(inArray(schema.documents.id, createdIds.documentIds));
      await db
        .delete(schema.knowledgeBases)
        .where(eq(schema.knowledgeBases.id, createdIds.knowledgeBaseId));
      await db.delete(schema.users).where(eq(schema.users.id, createdIds.userId));
    }

    if (closeDatabase) {
      await closeDatabase();
    }

    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it('enqueues one batch, persists progress, and resumes from unseen candidates only', async () => {
    const { eq } = drizzle;

    const firstBatch = await documentIndexBackfillService.enqueueBackfill({
      knowledgeBaseId: createdIds.knowledgeBaseId,
      limit: 1,
      trigger: 'manual',
      createdBy: createdIds.userId,
    });

    expect(firstBatch.runId).toBeTruthy();
    expect(firstBatch.documents.map((document) => document.id)).toEqual([secondDocumentId]);
    expect(firstBatch.enqueuedCount).toBe(1);
    expect(firstBatch.offset).toBe(0);
    expect(firstBatch.hasMore).toBe(true);

    const firstRunId = firstBatch.runId!;
    const firstJob = await documentProcessingQueue.getJob(
      `doc-${secondDocumentId}-v1-bf-${firstRunId}`
    );
    expect(firstJob?.data).toMatchObject({
      documentId: secondDocumentId,
      userId: createdIds.userId,
      targetDocumentVersion: 1,
      reason: 'backfill',
      backfillRunId: firstRunId,
    });

    const secondBatch = await documentIndexBackfillService.enqueueBackfill({
      runId: firstRunId,
      trigger: 'manual',
    });

    expect(secondBatch.runId).toBe(firstRunId);
    expect(secondBatch.documents.map((document) => document.id)).toEqual([firstDocumentId]);
    expect(secondBatch.enqueuedCount).toBe(1);
    expect(secondBatch.offset).toBe(1);
    expect(secondBatch.hasMore).toBe(false);

    const secondJob = await documentProcessingQueue.getJob(
      `doc-${firstDocumentId}-v1-bf-${firstRunId}`
    );
    expect(secondJob?.data).toMatchObject({
      documentId: firstDocumentId,
      userId: createdIds.userId,
      targetDocumentVersion: 1,
      reason: 'backfill',
      backfillRunId: firstRunId,
    });

    const runRows = await db
      .select()
      .from(schema.documentIndexBackfillRuns)
      .where(eq(schema.documentIndexBackfillRuns.id, firstRunId));
    expect(runRows).toHaveLength(1);
    expect(runRows[0]).toMatchObject({
      knowledgeBaseId: createdIds.knowledgeBaseId,
      candidateCount: 2,
      enqueuedCount: 2,
      cursorOffset: 2,
      hasMore: false,
      status: 'draining',
      createdBy: createdIds.userId,
    });

    const itemRows = await db
      .select()
      .from(schema.documentIndexBackfillItems)
      .where(eq(schema.documentIndexBackfillItems.runId, firstRunId));

    expect(itemRows).toHaveLength(2);
    const itemStatusByDocumentId = new Map(
      itemRows.map((item) => [item.documentId, { status: item.status, jobId: item.jobId }])
    );
    expect(itemStatusByDocumentId.get(secondDocumentId)).toMatchObject({
      status: 'enqueued',
      jobId: `doc-${secondDocumentId}-v1-bf-${firstRunId}`,
    });
    expect(itemStatusByDocumentId.get(firstDocumentId)).toMatchObject({
      status: 'enqueued',
      jobId: `doc-${firstDocumentId}-v1-bf-${firstRunId}`,
    });
  });
});
