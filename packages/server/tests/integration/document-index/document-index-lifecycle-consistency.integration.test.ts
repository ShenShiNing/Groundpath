import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { getRealIntegrationDescribe, loadRealIntegrationEnv } from '../helpers/real-integration';

const describeRealIntegration = getRealIntegrationDescribe([
  'RUN_REAL_DOCUMENT_INDEX_LIFECYCLE_INTEGRATION',
  'RUN_REAL_DOCUMENT_LIFECYCLE_INTEGRATION',
]);

const dispatchDocumentProcessingMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve('document-processing-job'))
);
const logOperationMock = vi.hoisted(() => vi.fn());
const vectorDeleteMock = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));

type DbModule = typeof import('@core/db');
type SchemaModule = typeof import('@core/db/schema');
type DrizzleModule = typeof import('drizzle-orm');

interface FixtureIds {
  userId: string;
  knowledgeBaseId: string;
  documentId: string;
}

describeRealIntegration('document index lifecycle consistency real db integration', () => {
  const originalEnv = { ...process.env };

  let db: DbModule['db'];
  let closeDatabase: DbModule['closeDatabase'];
  let schema: SchemaModule;
  let drizzle: DrizzleModule;
  let documentService: typeof import('@modules/document/public/documents').documentService;
  let documentRepository: typeof import('@modules/document/public/repositories').documentRepository;
  let documentNodeSearchRepository: typeof import('@modules/document-index/repositories/document-node-search.repository').documentNodeSearchRepository;

  beforeAll(async () => {
    vi.resetModules();

    const envFromFile = loadRealIntegrationEnv();
    const databaseUrl =
      process.env.DOCUMENT_INDEX_LIFECYCLE_REAL_DATABASE_URL ??
      process.env.DOCUMENT_LIFECYCLE_REAL_DATABASE_URL ??
      envFromFile.DATABASE_URL;
    const redisUrl =
      process.env.DOCUMENT_INDEX_LIFECYCLE_REAL_REDIS_URL ??
      process.env.DOCUMENT_LIFECYCLE_REAL_REDIS_URL ??
      envFromFile.REDIS_URL;

    if (!databaseUrl || !redisUrl) {
      throw new Error(
        'Real document index lifecycle integration test requires DOCUMENT_INDEX_LIFECYCLE_REAL_DATABASE_URL/DOCUMENT_INDEX_LIFECYCLE_REAL_REDIS_URL or packages/server/.env.development.local'
      );
    }

    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      JWT_SECRET: 'test-jwt-secret-at-least-32-characters-long',
      ENCRYPTION_KEY: 'test-encryption-key-at-least-32-chars',
      EMAIL_VERIFICATION_SECRET: 'test-email-verification-secret',
      LOG_LEVEL: 'silent',
    });

    vi.doMock('@core/logger/operation-logger', () => ({
      logOperation: logOperationMock,
    }));

    vi.doMock('@core/document-processing', () => ({
      dispatchDocumentProcessing: dispatchDocumentProcessingMock,
    }));

    vi.doMock('@modules/vector/public/repositories', () => ({
      vectorRepository: {
        deleteByDocumentId: vectorDeleteMock,
      },
    }));

    ({ db, closeDatabase } = await import('@core/db'));
    schema = await import('@core/db/schema');
    drizzle = await import('drizzle-orm');
    ({ documentService } = await import('@modules/document/public/documents'));
    ({ documentRepository } = await import('@modules/document/public/repositories'));
    ({ documentNodeSearchRepository } =
      await import('@modules/document-index/repositories/document-node-search.repository'));
  }, 30_000);

  beforeEach(() => {
    dispatchDocumentProcessingMock.mockReset();
    dispatchDocumentProcessingMock.mockResolvedValue('document-processing-job');
    logOperationMock.mockClear();
    vectorDeleteMock.mockClear();
  });

  afterAll(async () => {
    if (closeDatabase) {
      await closeDatabase();
    }

    vi.doUnmock('@core/logger/operation-logger');
    vi.doUnmock('@core/document-processing');
    vi.doUnmock('@modules/vector/public/repositories');
    vi.resetModules();

    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  async function createFixture(input: {
    activeIndexVersionId?: string | null;
    deletedAt?: Date | null;
    deletedBy?: string | null;
    documentCount: number;
    totalChunks: number;
    chunkCount: number;
    currentVersion: number;
    processingStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  }): Promise<FixtureIds> {
    const now = new Date();
    const userId = randomUUID();
    const knowledgeBaseId = randomUUID();
    const documentId = randomUUID();

    await db.insert(schema.users).values({
      id: userId,
      username: `doc-index-lifecycle-${userId.slice(0, 8)}`,
      email: `doc-index-lifecycle-${userId.slice(0, 8)}@example.com`,
      password: null,
      status: 'active',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.knowledgeBases).values({
      id: knowledgeBaseId,
      userId,
      name: `Doc Index Lifecycle KB ${knowledgeBaseId.slice(0, 8)}`,
      description: 'document index lifecycle integration fixture',
      embeddingProvider: 'openai',
      embeddingModel: 'text-embedding-3-small',
      embeddingDimensions: 1536,
      documentCount: input.documentCount,
      totalChunks: input.totalChunks,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.documents).values({
      id: documentId,
      userId,
      knowledgeBaseId,
      title: 'Document Index Lifecycle Fixture',
      description: 'integration fixture',
      currentVersion: input.currentVersion,
      activeIndexVersionId: input.activeIndexVersionId ?? null,
      fileName: 'fixture.md',
      mimeType: 'text/markdown',
      fileSize: 128,
      fileExtension: 'md',
      documentType: 'markdown',
      processingStatus: input.processingStatus ?? 'completed',
      processingError: null,
      processingStartedAt: null,
      publishGeneration: 0,
      chunkCount: input.chunkCount,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
      deletedBy: input.deletedBy ?? null,
      deletedAt: input.deletedAt ?? null,
    });

    return {
      userId,
      knowledgeBaseId,
      documentId,
    };
  }

  async function createIndexVersionFixture(input: {
    documentId: string;
    indexVersionId: string;
    status: 'building' | 'active' | 'failed' | 'superseded';
    documentVersion: number;
    title?: string;
    content?: string;
  }) {
    const now = new Date();
    const nodeId = randomUUID();

    await db.insert(schema.documentIndexVersions).values({
      id: input.indexVersionId,
      documentId: input.documentId,
      documentVersion: input.documentVersion,
      indexVersion: `idx-${input.indexVersionId.slice(0, 8)}`,
      routeMode: 'structured',
      status: input.status,
      createdBy: null,
      builtAt: now,
      activatedAt: input.status === 'active' ? now : null,
    });

    await db.insert(schema.documentNodes).values({
      id: nodeId,
      documentId: input.documentId,
      indexVersionId: input.indexVersionId,
      nodeType: 'section',
      title: input.title ?? 'Overview',
      depth: 1,
      sectionPath: ['Overview'],
      pageStart: 1,
      pageEnd: 1,
      parentId: null,
      orderNo: 1,
      tokenCount: 4,
      stableLocator: 'Overview',
      createdAt: now,
    });

    await db.insert(schema.documentNodeContents).values({
      nodeId,
      documentId: input.documentId,
      indexVersionId: input.indexVersionId,
      content: input.content ?? 'System overview',
      contentPreview: input.content ?? 'System overview',
      tokenCount: 4,
      createdAt: now,
    });

    return { nodeId };
  }

  async function cleanupFixture(fixture: FixtureIds): Promise<void> {
    const { eq } = drizzle;

    await db.delete(schema.documents).where(eq(schema.documents.id, fixture.documentId));
    await db
      .delete(schema.knowledgeBases)
      .where(eq(schema.knowledgeBases.id, fixture.knowledgeBaseId));
    await db.delete(schema.users).where(eq(schema.users.id, fixture.userId));
  }

  async function getDocument(documentId: string) {
    const { eq } = drizzle;
    const rows = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, documentId))
      .limit(1);
    return rows[0];
  }

  it('clears activeIndexVersionId across delete and restore, then lets backfill compensate when requeue fails', async () => {
    const activeIndexVersionId = randomUUID();
    const fixture = await createFixture({
      activeIndexVersionId,
      documentCount: 1,
      totalChunks: 0,
      chunkCount: 0,
      currentVersion: 2,
    });

    await createIndexVersionFixture({
      documentId: fixture.documentId,
      indexVersionId: activeIndexVersionId,
      status: 'active',
      documentVersion: 2,
    });

    try {
      await documentService.delete(fixture.documentId, fixture.userId);

      const deletedDocument = await getDocument(fixture.documentId);
      expect(deletedDocument?.deletedAt).toBeTruthy();
      expect(deletedDocument?.activeIndexVersionId).toBeNull();

      dispatchDocumentProcessingMock.mockRejectedValueOnce(new Error('queue unavailable'));

      await documentService.restore(fixture.documentId, fixture.userId);

      // Wait for the async dispatch failure handler to update processingStatus
      await new Promise((resolve) => setTimeout(resolve, 50));

      const restoredDocument = await getDocument(fixture.documentId);
      expect(restoredDocument?.deletedAt).toBeNull();
      expect(restoredDocument?.processingStatus).toBe('failed');
      expect(restoredDocument?.activeIndexVersionId).toBeNull();

      const backfillCandidates = await documentRepository.listBackfillCandidates({
        knowledgeBaseId: fixture.knowledgeBaseId,
        limit: 10,
      });

      expect(backfillCandidates.documents.map((document) => document.id)).toContain(
        fixture.documentId
      );
      expect(dispatchDocumentProcessingMock).toHaveBeenCalledTimes(1);
      expect(vectorDeleteMock).toHaveBeenCalledTimes(1);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it('only exposes structured nodes when the referenced index version is active', async () => {
    const indexVersionId = randomUUID();
    const fixture = await createFixture({
      activeIndexVersionId: indexVersionId,
      documentCount: 1,
      totalChunks: 0,
      chunkCount: 0,
      currentVersion: 1,
    });

    const { nodeId } = await createIndexVersionFixture({
      documentId: fixture.documentId,
      indexVersionId,
      status: 'building',
      documentVersion: 1,
      title: 'Architecture Overview',
      content: 'Architecture overview content',
    });

    try {
      const hiddenHeads = await documentNodeSearchRepository.searchActiveNodeHeads({
        userId: fixture.userId,
        knowledgeBaseId: fixture.knowledgeBaseId,
        terms: ['overview'],
        limit: 10,
      });
      const hiddenNodes = await documentNodeSearchRepository.searchActiveNodes({
        userId: fixture.userId,
        knowledgeBaseId: fixture.knowledgeBaseId,
        terms: ['overview'],
        limit: 10,
      });
      const hiddenNodeById = await documentNodeSearchRepository.getAccessibleNodesByIds({
        userId: fixture.userId,
        knowledgeBaseId: fixture.knowledgeBaseId,
        nodeIds: [nodeId],
      });

      expect(hiddenHeads).toHaveLength(0);
      expect(hiddenNodes).toHaveLength(0);
      expect(hiddenNodeById).toHaveLength(0);

      const { eq } = drizzle;
      await db
        .update(schema.documentIndexVersions)
        .set({
          status: 'active',
          activatedAt: new Date(),
        })
        .where(eq(schema.documentIndexVersions.id, indexVersionId));

      const visibleHeads = await documentNodeSearchRepository.searchActiveNodeHeads({
        userId: fixture.userId,
        knowledgeBaseId: fixture.knowledgeBaseId,
        terms: ['overview'],
        limit: 10,
      });
      const visibleNodes = await documentNodeSearchRepository.searchActiveNodes({
        userId: fixture.userId,
        knowledgeBaseId: fixture.knowledgeBaseId,
        terms: ['overview'],
        limit: 10,
      });
      const visibleNodeById = await documentNodeSearchRepository.getAccessibleNodesByIds({
        userId: fixture.userId,
        knowledgeBaseId: fixture.knowledgeBaseId,
        nodeIds: [nodeId],
      });

      expect(visibleHeads).toHaveLength(1);
      expect(visibleHeads[0]).toMatchObject({
        nodeId,
        documentId: fixture.documentId,
        indexVersionId,
      });
      expect(visibleNodes).toHaveLength(1);
      expect(visibleNodes[0]).toMatchObject({
        nodeId,
        documentId: fixture.documentId,
        indexVersionId,
      });
      expect(visibleNodeById).toHaveLength(1);
      expect(visibleNodeById[0]).toMatchObject({
        nodeId,
        documentId: fixture.documentId,
        indexVersionId,
      });
    } finally {
      await cleanupFixture(fixture);
    }
  });
});
