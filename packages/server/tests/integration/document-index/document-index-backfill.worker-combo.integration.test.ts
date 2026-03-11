import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

function shouldRunRealWorkerIntegration(): boolean {
  if (
    process.env.RUN_REAL_BACKFILL_WORKER_INTEGRATION === '1' ||
    process.env.RUN_REAL_BACKFILL_INTEGRATION === '1'
  ) {
    return true;
  }

  const testEnv = readEnvFile(path.resolve(import.meta.dirname, '../../../.env.test.local'));
  return (
    testEnv.RUN_REAL_BACKFILL_WORKER_INTEGRATION === '1' ||
    testEnv.RUN_REAL_BACKFILL_INTEGRATION === '1'
  );
}

const describeRealWorkerIntegration = shouldRunRealWorkerIntegration() ? describe : describe.skip;

async function waitFor<T>(
  producer: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs: number = 10_000,
  intervalMs: number = 100
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastValue: T | undefined;

  while (Date.now() < deadline) {
    lastValue = await producer();
    if (predicate(lastValue)) {
      return lastValue;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for condition. Last value: ${JSON.stringify(lastValue)}`);
}

describeRealWorkerIntegration('document index backfill real db/queue worker combination', () => {
  const originalEnv = { ...process.env };
  const queuePrefix = `ka-backfill-worker-int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const queueSuffix = queuePrefix.slice(-12);
  const userId = randomUUID();
  const knowledgeBaseId = randomUUID();
  const documentId = randomUUID();
  const createdIds = {
    userId,
    knowledgeBaseId,
    documentId,
  };

  let db: typeof import('@shared/db').db;
  let closeDatabase: typeof import('@shared/db').closeDatabase;
  let documentIndexBackfillService: typeof import('@modules/document-index/services/document-index-backfill.service').documentIndexBackfillService;
  let processingRecoveryService: typeof import('@modules/rag/services/processing-recovery.service').processingRecoveryService;
  let documentProcessingQueue: typeof import('@modules/rag/queue/document-processing.queue').documentProcessingQueue;
  let startDocumentProcessingWorker: typeof import('@modules/rag/queue/document-processing.queue').startDocumentProcessingWorker;
  let stopDocumentProcessingWorker: typeof import('@modules/rag/queue/document-processing.queue').stopDocumentProcessingWorker;
  let documentIndexBackfillProgressService: typeof import('@modules/document-index/services/document-index-backfill-progress.service').documentIndexBackfillProgressService;
  let schema: typeof import('@shared/db/schema');
  let drizzle: typeof import('drizzle-orm');

  const processingServiceMock = {
    processDocument: vi.fn(),
    releaseProcessingLock: vi.fn(),
  };

  beforeAll(async () => {
    vi.resetModules();

    const envFromFile = readEnvFile(
      path.resolve(import.meta.dirname, '../../../.env.development.local')
    );
    const databaseUrl = process.env.BACKFILL_REAL_DATABASE_URL ?? envFromFile.DATABASE_URL;
    const redisUrl = process.env.BACKFILL_REAL_REDIS_URL ?? envFromFile.REDIS_URL;

    if (!databaseUrl || !redisUrl) {
      throw new Error(
        'Real worker integration test requires BACKFILL_REAL_DATABASE_URL/BACKFILL_REAL_REDIS_URL or packages/server/.env.development.local'
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

    vi.doMock('@modules/rag/services/processing.service', () => ({
      processingService: processingServiceMock,
    }));

    ({ db, closeDatabase } = await import('@shared/db'));
    ({ documentIndexBackfillService } =
      await import('@modules/document-index/services/document-index-backfill.service'));
    ({ processingRecoveryService } =
      await import('@modules/rag/services/processing-recovery.service'));
    ({ documentProcessingQueue, startDocumentProcessingWorker, stopDocumentProcessingWorker } =
      await import('@modules/rag/queue/document-processing.queue'));
    ({ documentIndexBackfillProgressService } =
      await import('@modules/document-index/services/document-index-backfill-progress.service'));
    schema = await import('@shared/db/schema');
    drizzle = await import('drizzle-orm');

    const now = new Date();
    await db.insert(schema.users).values({
      id: createdIds.userId,
      username: `bfw-${queueSuffix}`,
      email: `bfw-${queueSuffix}@example.com`,
      password: null,
      status: 'active',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.knowledgeBases).values({
      id: createdIds.knowledgeBaseId,
      userId: createdIds.userId,
      name: `Backfill Worker Integration ${queuePrefix}`,
      description: 'real db/queue worker integration fixture',
      embeddingProvider: 'openai',
      embeddingModel: 'text-embedding-3-small',
      embeddingDimensions: 1536,
      documentCount: 1,
      totalChunks: 0,
      createdBy: createdIds.userId,
      updatedBy: createdIds.userId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.documents).values({
      id: createdIds.documentId,
      userId: createdIds.userId,
      knowledgeBaseId: createdIds.knowledgeBaseId,
      title: 'Worker Combo Candidate',
      description: 'integration fixture',
      currentVersion: 1,
      activeIndexVersionId: null,
      fileName: 'combo.md',
      mimeType: 'text/markdown',
      fileSize: 32,
      fileExtension: 'md',
      documentType: 'markdown',
      processingStatus: 'completed',
      processingError: null,
      processingStartedAt: null,
      publishGeneration: 0,
      chunkCount: 0,
      createdBy: createdIds.userId,
      updatedBy: createdIds.userId,
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
      updatedAt: new Date('2026-03-10T00:00:00.000Z'),
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    try {
      await stopDocumentProcessingWorker?.();
    } catch {
      // ignore
    }

    if (documentProcessingQueue) {
      try {
        await documentProcessingQueue.obliterate({ force: true });
      } catch {
        // ignore queue cleanup failures
      }
      await documentProcessingQueue.close();
    }

    if (db && schema && drizzle) {
      const { eq } = drizzle;
      await db
        .delete(schema.documentIndexBackfillItems)
        .where(eq(schema.documentIndexBackfillItems.documentId, createdIds.documentId));
      await db
        .delete(schema.documentIndexBackfillRuns)
        .where(eq(schema.documentIndexBackfillRuns.knowledgeBaseId, createdIds.knowledgeBaseId));
      await db.delete(schema.documents).where(eq(schema.documents.id, createdIds.documentId));
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

  it('skips two stale backfill generations across repeated version switches and recovery, then completes the latest rerun', async () => {
    const { eq } = drizzle;

    processingServiceMock.processDocument.mockImplementation(
      async (documentId: string, _userId: string, request?: { targetDocumentVersion?: number }) => {
        const rows = await db
          .select()
          .from(schema.documents)
          .where(eq(schema.documents.id, documentId))
          .limit(1);
        const document = rows[0];

        if (!document) {
          return { outcome: 'failed', reason: 'document_not_found' as const };
        }

        if (
          request?.targetDocumentVersion !== undefined &&
          document.currentVersion !== request.targetDocumentVersion
        ) {
          return { outcome: 'skipped', reason: 'stale_target_version' as const };
        }

        await db
          .update(schema.documents)
          .set({
            processingStatus: 'completed',
            processingError: null,
            processingStartedAt: null,
          })
          .where(eq(schema.documents.id, documentId));

        return { outcome: 'completed' as const };
      }
    );

    const firstBatch = await documentIndexBackfillService.enqueueBackfill({
      knowledgeBaseId: createdIds.knowledgeBaseId,
      includeIndexed: true,
      limit: 1,
      trigger: 'manual',
      createdBy: createdIds.userId,
    });
    expect(firstBatch.runId).toBeTruthy();

    await db
      .update(schema.documents)
      .set({
        currentVersion: 2,
        processingStatus: 'processing',
        processingStartedAt: new Date('2026-03-10T01:00:00.000Z'),
        updatedAt: new Date('2026-03-11T00:00:00.000Z'),
      })
      .where(eq(schema.documents.id, createdIds.documentId));

    const recoveryResult = await processingRecoveryService.recoverStaleProcessing(
      new Date('2026-03-12T00:00:00.000Z')
    );
    expect(recoveryResult.recoveredDocumentIds).toEqual([createdIds.documentId]);

    const secondBatch = await documentIndexBackfillService.enqueueBackfill({
      knowledgeBaseId: createdIds.knowledgeBaseId,
      includeIndexed: true,
      limit: 1,
      trigger: 'manual',
      createdBy: createdIds.userId,
    });
    expect(secondBatch.runId).toBeTruthy();
    expect(secondBatch.runId).not.toBe(firstBatch.runId);

    await db
      .update(schema.documents)
      .set({
        currentVersion: 3,
        processingStatus: 'processing',
        processingStartedAt: new Date('2026-03-10T02:00:00.000Z'),
        updatedAt: new Date('2026-03-12T00:00:00.000Z'),
      })
      .where(eq(schema.documents.id, createdIds.documentId));

    const secondRecoveryResult = await processingRecoveryService.recoverStaleProcessing(
      new Date('2026-03-13T00:00:00.000Z')
    );
    expect(secondRecoveryResult.recoveredDocumentIds).toEqual([createdIds.documentId]);

    const worker = startDocumentProcessingWorker();
    await worker.waitUntilReady();

    const firstRun = await waitFor(
      async () => documentIndexBackfillProgressService.getRun(firstBatch.runId!),
      (run) => run?.status === 'completed'
    );
    const firstItem = await waitFor(
      async () =>
        db
          .select()
          .from(schema.documentIndexBackfillItems)
          .where(eq(schema.documentIndexBackfillItems.runId, firstBatch.runId!))
          .limit(1)
          .then((rows) => rows[0]),
      (item) => item?.status === 'skipped'
    );

    expect(firstRun).toMatchObject({
      status: 'completed',
      enqueuedCount: 1,
      skippedCount: 1,
    });
    expect(firstItem).toMatchObject({
      documentId: createdIds.documentId,
      documentVersion: 1,
      status: 'skipped',
      error: 'stale_target_version',
    });

    const secondRun = await waitFor(
      async () => documentIndexBackfillProgressService.getRun(secondBatch.runId!),
      (run) => run?.status === 'completed'
    );
    const secondItem = await waitFor(
      async () =>
        db
          .select()
          .from(schema.documentIndexBackfillItems)
          .where(eq(schema.documentIndexBackfillItems.runId, secondBatch.runId!))
          .limit(1)
          .then((rows) => rows[0]),
      (item) => item?.status === 'skipped'
    );

    expect(secondRun).toMatchObject({
      status: 'completed',
      enqueuedCount: 1,
      skippedCount: 1,
    });
    expect(secondItem).toMatchObject({
      documentId: createdIds.documentId,
      documentVersion: 2,
      status: 'skipped',
      error: 'stale_target_version',
    });

    const thirdBatch = await documentIndexBackfillService.enqueueBackfill({
      knowledgeBaseId: createdIds.knowledgeBaseId,
      includeIndexed: true,
      limit: 1,
      trigger: 'manual',
      createdBy: createdIds.userId,
    });
    expect(thirdBatch.runId).toBeTruthy();
    expect(thirdBatch.runId).not.toBe(firstBatch.runId);
    expect(thirdBatch.runId).not.toBe(secondBatch.runId);

    const thirdRun = await waitFor(
      async () => documentIndexBackfillProgressService.getRun(thirdBatch.runId!),
      (run) => run?.status === 'completed'
    );
    const thirdItem = await waitFor(
      async () =>
        db
          .select()
          .from(schema.documentIndexBackfillItems)
          .where(eq(schema.documentIndexBackfillItems.runId, thirdBatch.runId!))
          .limit(1)
          .then((rows) => rows[0]),
      (item) => item?.status === 'completed'
    );

    expect(thirdRun).toMatchObject({
      status: 'completed',
      enqueuedCount: 1,
      completedCount: 1,
    });
    expect(thirdItem).toMatchObject({
      documentId: createdIds.documentId,
      documentVersion: 3,
      status: 'completed',
    });

    const finalDocumentRows = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, createdIds.documentId))
      .limit(1);

    expect(finalDocumentRows[0]).toMatchObject({
      currentVersion: 3,
      processingStatus: 'completed',
    });
    expect(processingServiceMock.processDocument).toHaveBeenCalledTimes(3);
  });
});
