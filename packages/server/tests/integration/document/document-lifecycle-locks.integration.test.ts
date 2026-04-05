import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { DOCUMENT_ERROR_CODES } from '@groundpath/shared';
import { getRealIntegrationDescribe, loadRealIntegrationEnv } from '../helpers/real-integration';

const describeRealIntegration = getRealIntegrationDescribe(
  'RUN_REAL_DOCUMENT_LIFECYCLE_INTEGRATION'
);

const runtimeState = vi.hoisted(() => ({
  failChunkDelete: false,
  getEmbeddingConfigBlocker: null as Promise<void> | null,
}));

const dispatchDocumentProcessingMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve('document-processing-job'))
);
const knowledgeBaseGetEmbeddingConfigMock = vi.hoisted(() => vi.fn());
const logOperationMock = vi.hoisted(() => vi.fn());
const vectorMarkAsDeletedMock = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
const vectorDeleteMock = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));

type DbModule = typeof import('@core/db');
type SchemaModule = typeof import('@core/db/schema');
type DrizzleModule = typeof import('drizzle-orm');

interface FixtureIds {
  userId: string;
  knowledgeBaseId: string;
  documentId: string;
  versionIds: string[];
}

describeRealIntegration('document lifecycle real db integration', () => {
  const originalEnv = { ...process.env };

  let db: DbModule['db'];
  let closeDatabase: DbModule['closeDatabase'];
  let schema: SchemaModule;
  let drizzle: DrizzleModule;
  let documentService: typeof import('@modules/document/public/documents').documentService;

  beforeAll(async () => {
    vi.resetModules();

    const envFromFile = loadRealIntegrationEnv();
    const databaseUrl =
      process.env.DOCUMENT_LIFECYCLE_REAL_DATABASE_URL ?? envFromFile.DATABASE_URL;
    const redisUrl = process.env.DOCUMENT_LIFECYCLE_REAL_REDIS_URL ?? envFromFile.REDIS_URL;

    if (!databaseUrl || !redisUrl) {
      throw new Error(
        'Real document lifecycle integration test requires DOCUMENT_LIFECYCLE_REAL_DATABASE_URL/DOCUMENT_LIFECYCLE_REAL_REDIS_URL or repo root .env.development.local'
      );
    }

    Object.assign(process.env, envFromFile, {
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

    vi.doMock('@modules/knowledge-base/public/management', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('@modules/knowledge-base/public/management')>();

      knowledgeBaseGetEmbeddingConfigMock.mockImplementation(async (kbId: string) => {
        if (runtimeState.getEmbeddingConfigBlocker) {
          await runtimeState.getEmbeddingConfigBlocker;
        }

        return actual.knowledgeBaseService.getEmbeddingConfig(kbId);
      });

      return {
        ...actual,
        knowledgeBaseService: {
          ...actual.knowledgeBaseService,
          getEmbeddingConfig: knowledgeBaseGetEmbeddingConfigMock,
        },
      };
    });

    vi.doMock('@modules/vector/public/repositories', () => ({
      vectorRepository: {
        markAsDeleted: vectorMarkAsDeletedMock,
        deleteByDocumentId: vectorDeleteMock,
      },
    }));

    vi.doMock(
      '@modules/document/repositories/document-chunk.repository',
      async (importOriginal) => {
        const actual =
          await importOriginal<
            typeof import('@modules/document/repositories/document-chunk.repository')
          >();

        return {
          ...actual,
          documentChunkRepository: {
            ...actual.documentChunkRepository,
            deleteByDocumentId: vi.fn(async (documentId: string, tx?: unknown) => {
              if (runtimeState.failChunkDelete) {
                throw new Error('chunk cleanup failed');
              }

              await actual.documentChunkRepository.deleteByDocumentId(
                documentId,
                tx as Parameters<typeof actual.documentChunkRepository.deleteByDocumentId>[1]
              );
            }),
          },
        };
      }
    );

    ({ db, closeDatabase } = await import('@core/db'));
    schema = await import('@core/db/schema');
    drizzle = await import('drizzle-orm');
    ({ documentService } = await import('@modules/document/public/documents'));
  }, 30_000);

  beforeEach(() => {
    runtimeState.failChunkDelete = false;
    runtimeState.getEmbeddingConfigBlocker = null;
    dispatchDocumentProcessingMock.mockClear();
    knowledgeBaseGetEmbeddingConfigMock.mockClear();
    logOperationMock.mockClear();
    vectorMarkAsDeletedMock.mockClear();
    vectorDeleteMock.mockClear();
  });

  afterAll(async () => {
    if (closeDatabase) {
      await closeDatabase();
    }

    vi.doUnmock('@core/logger/operation-logger');
    vi.doUnmock('@core/document-processing');
    vi.doUnmock('@modules/knowledge-base/public/management');
    vi.doUnmock('@modules/vector/public/repositories');
    vi.doUnmock('@modules/document/repositories/document-chunk.repository');
    vi.resetModules();

    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  async function createFixture(input: {
    deletedAt?: Date | null;
    deletedBy?: string | null;
    documentCount: number;
    totalChunks: number;
    chunkCount: number;
    currentVersion: number;
    processingStatus?: 'pending' | 'processing' | 'completed' | 'failed';
    versions?: Array<{
      version: number;
      fileName?: string;
      mimeType?: string;
      fileSize?: number;
      fileExtension?: string;
      documentType?: 'pdf' | 'markdown' | 'text' | 'docx' | 'other';
      storageKey?: string;
      textContent?: string | null;
      source?: 'upload' | 'edit' | 'ai_generate' | 'restore';
      changeNote?: string | null;
    }>;
  }): Promise<FixtureIds> {
    const now = new Date();
    const userId = randomUUID();
    const knowledgeBaseId = randomUUID();
    const documentId = randomUUID();
    const versionIds = (input.versions ?? []).map(() => randomUUID());

    await db.insert(schema.users).values({
      id: userId,
      username: `doc-lock-${userId.slice(0, 8)}`,
      email: `doc-lock-${userId.slice(0, 8)}@example.com`,
      password: null,
      status: 'active',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.knowledgeBases).values({
      id: knowledgeBaseId,
      userId,
      name: `Doc Lock KB ${knowledgeBaseId.slice(0, 8)}`,
      description: 'document lifecycle integration fixture',
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
      title: 'Document Lifecycle Fixture',
      description: 'integration fixture',
      currentVersion: input.currentVersion,
      activeIndexVersionId: null,
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

    if ((input.versions ?? []).length > 0) {
      await db.insert(schema.documentVersions).values(
        input.versions!.map((version, index) => ({
          id: versionIds[index]!,
          documentId,
          version: version.version,
          fileName: version.fileName ?? `fixture-v${version.version}.md`,
          mimeType: version.mimeType ?? 'text/markdown',
          fileSize: version.fileSize ?? 128,
          fileExtension: version.fileExtension ?? 'md',
          documentType: version.documentType ?? 'markdown',
          storageKey: version.storageKey ?? `documents/${documentId}/v${version.version}.md`,
          textContent: version.textContent ?? `# version ${version.version}`,
          source: version.source ?? 'upload',
          changeNote: version.changeNote ?? null,
          createdBy: userId,
          createdAt: now,
        }))
      );
    }

    return {
      userId,
      knowledgeBaseId,
      documentId,
      versionIds,
    };
  }

  async function cleanupFixture(fixture: FixtureIds): Promise<void> {
    const { eq } = drizzle;

    await db
      .delete(schema.documentVersions)
      .where(eq(schema.documentVersions.documentId, fixture.documentId));
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

  async function getKnowledgeBase(knowledgeBaseId: string) {
    const { eq } = drizzle;
    const rows = await db
      .select()
      .from(schema.knowledgeBases)
      .where(eq(schema.knowledgeBases.id, knowledgeBaseId))
      .limit(1);
    return rows[0];
  }

  async function getDocumentVersions(documentId: string) {
    const { eq } = drizzle;
    return db
      .select()
      .from(schema.documentVersions)
      .where(eq(schema.documentVersions.documentId, documentId));
  }

  it('keeps delete idempotent and decrements counters only once', async () => {
    const fixture = await createFixture({
      documentCount: 1,
      totalChunks: 3,
      chunkCount: 3,
      currentVersion: 1,
      versions: [{ version: 1 }],
    });

    try {
      await documentService.delete(fixture.documentId, fixture.userId);
      await documentService.delete(fixture.documentId, fixture.userId);

      const document = await getDocument(fixture.documentId);
      const knowledgeBase = await getKnowledgeBase(fixture.knowledgeBaseId);

      expect(document?.deletedAt).toBeTruthy();
      expect(document?.chunkCount).toBe(0);
      expect(knowledgeBase?.documentCount).toBe(0);
      expect(knowledgeBase?.totalChunks).toBe(0);
      expect(vectorDeleteMock).toHaveBeenCalledTimes(1);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it('keeps restore idempotent and increments counters only once', async () => {
    const fixture = await createFixture({
      deletedAt: new Date('2026-03-20T00:00:00.000Z'),
      deletedBy: 'seed-user',
      documentCount: 0,
      totalChunks: 0,
      chunkCount: 0,
      currentVersion: 2,
      processingStatus: 'pending',
      versions: [{ version: 1 }, { version: 2, source: 'restore' }],
    });

    try {
      await documentService.restore(fixture.documentId, fixture.userId);
      await documentService.restore(fixture.documentId, fixture.userId);

      const document = await getDocument(fixture.documentId);
      const knowledgeBase = await getKnowledgeBase(fixture.knowledgeBaseId);

      expect(document?.deletedAt).toBeNull();
      expect(document?.processingStatus).toBe('pending');
      expect(knowledgeBase?.documentCount).toBe(1);
      expect(dispatchDocumentProcessingMock).toHaveBeenCalledTimes(1);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it('does not hard delete a document restored before permanent delete enters the transaction', async () => {
    const fixture = await createFixture({
      deletedAt: new Date('2026-03-20T00:00:00.000Z'),
      deletedBy: 'seed-user',
      documentCount: 0,
      totalChunks: 0,
      chunkCount: 0,
      currentVersion: 1,
      processingStatus: 'pending',
      versions: [{ version: 1 }],
    });

    let releaseGetEmbeddingConfig: (() => void) | undefined;
    runtimeState.getEmbeddingConfigBlocker = new Promise<void>((resolve) => {
      releaseGetEmbeddingConfig = resolve;
    });

    try {
      const permanentDeletePromise = documentService.permanentDelete(
        fixture.documentId,
        fixture.userId
      );

      await vi.waitFor(() => {
        expect(knowledgeBaseGetEmbeddingConfigMock).toHaveBeenCalledTimes(1);
      });

      await documentService.restore(fixture.documentId, fixture.userId);

      releaseGetEmbeddingConfig?.();
      runtimeState.getEmbeddingConfigBlocker = null;

      await expect(permanentDeletePromise).rejects.toMatchObject({
        code: DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND,
        statusCode: 404,
      });

      const document = await getDocument(fixture.documentId);
      const knowledgeBase = await getKnowledgeBase(fixture.knowledgeBaseId);
      const versions = await getDocumentVersions(fixture.documentId);

      expect(document).toMatchObject({
        id: fixture.documentId,
        deletedAt: null,
        processingStatus: 'pending',
      });
      expect(knowledgeBase?.documentCount).toBe(1);
      expect(versions).toHaveLength(1);
      expect(dispatchDocumentProcessingMock).toHaveBeenCalledTimes(1);
      expect(vectorMarkAsDeletedMock).not.toHaveBeenCalled();
      expect(vectorDeleteMock).not.toHaveBeenCalled();
    } finally {
      releaseGetEmbeddingConfig?.();
      runtimeState.getEmbeddingConfigBlocker = null;
      await cleanupFixture(fixture);
    }
  });

  it('rolls back delete when chunk cleanup fails inside the transaction', async () => {
    const fixture = await createFixture({
      documentCount: 1,
      totalChunks: 2,
      chunkCount: 2,
      currentVersion: 1,
      versions: [{ version: 1 }],
    });

    runtimeState.failChunkDelete = true;

    try {
      await expect(documentService.delete(fixture.documentId, fixture.userId)).rejects.toThrow(
        'chunk cleanup failed'
      );

      const document = await getDocument(fixture.documentId);
      const knowledgeBase = await getKnowledgeBase(fixture.knowledgeBaseId);

      expect(document?.deletedAt).toBeNull();
      expect(document?.chunkCount).toBe(2);
      expect(knowledgeBase?.documentCount).toBe(1);
      expect(knowledgeBase?.totalChunks).toBe(2);
    } finally {
      runtimeState.failChunkDelete = false;
      await cleanupFixture(fixture);
    }
  });

  it('appends a restore version and advances currentVersion', async () => {
    const fixture = await createFixture({
      documentCount: 1,
      totalChunks: 0,
      chunkCount: 0,
      currentVersion: 2,
      versions: [
        { version: 1, textContent: '# first version' },
        { version: 2, textContent: '# second version', source: 'edit' },
      ],
    });

    try {
      await documentService.restoreVersion(
        fixture.documentId,
        fixture.versionIds[0]!,
        fixture.userId
      );

      const document = await getDocument(fixture.documentId);
      const { eq, and } = drizzle;
      const versions = await db
        .select()
        .from(schema.documentVersions)
        .where(eq(schema.documentVersions.documentId, fixture.documentId));
      const restoredVersion = versions.find((version) => version.version === 3);
      const duplicateVersion = await db
        .select()
        .from(schema.documentVersions)
        .where(
          and(
            eq(schema.documentVersions.documentId, fixture.documentId),
            eq(schema.documentVersions.version, 3)
          )
        )
        .limit(1);

      expect(document?.currentVersion).toBe(3);
      expect(document?.processingStatus).toBe('pending');
      expect(restoredVersion?.source).toBe('restore');
      expect(restoredVersion?.changeNote).toBe('Restored from version 1');
      expect(duplicateVersion).toHaveLength(1);
      expect(dispatchDocumentProcessingMock).toHaveBeenCalledWith(
        fixture.documentId,
        fixture.userId,
        expect.objectContaining({
          targetDocumentVersion: 3,
          reason: 'restore',
        })
      );
    } finally {
      await cleanupFixture(fixture);
    }
  });
});
