import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(),
  indexVersions: new Map<string, Record<string, unknown>>(),
  chunks: [] as Array<Record<string, unknown>>,
  vectors: [] as Array<Record<string, unknown>>,
  backfillRuns: new Map<string, Record<string, unknown>>(),
  backfillItems: new Map<string, Record<string, unknown>>(),
  queuedJobs: [] as Array<Record<string, unknown>>,
}));

const configState = vi.hoisted(() => ({
  documentConfig: {
    buildCleanupRetentionDays: 7,
    buildCleanupBatchSize: 100,
    processingTimeoutMinutes: 30,
    processingRecoveryBatchSize: 100,
    processingRecoveryRequeueEnabled: false,
  },
  backfillConfig: {
    batchSize: 100,
    enqueueDelayMs: 0,
  },
}));

function addBuildArtifacts(input: {
  indexVersionId: string;
  documentVersion: number;
  content: string;
  score?: number;
}) {
  state.chunks.push({
    id: `chunk-${input.indexVersionId}`,
    documentId: 'doc-1',
    version: input.documentVersion,
    indexVersionId: input.indexVersionId,
    chunkIndex: 0,
    content: input.content,
  });

  state.vectors.push({
    id: `vec-${input.indexVersionId}`,
    documentId: 'doc-1',
    knowledgeBaseId: 'kb-1',
    indexVersionId: input.indexVersionId,
    content: input.content,
    score: input.score ?? 0.9,
    chunkIndex: 0,
    isDeleted: false,
  });
}

function resetState() {
  state.documents.clear();
  state.indexVersions.clear();
  state.chunks = [];
  state.vectors = [];
  state.backfillRuns.clear();
  state.backfillItems.clear();
  state.queuedJobs = [];

  state.documents.set('doc-1', {
    id: 'doc-1',
    userId: 'user-1',
    knowledgeBaseId: 'kb-1',
    title: 'Fixture Document',
    documentType: 'markdown',
    currentVersion: 1,
    activeIndexVersionId: 'idx-old',
    processingStatus: 'completed',
    processingError: null,
    processingStartedAt: null,
    publishGeneration: 0,
    updatedAt: new Date('2026-03-10T00:00:00.000Z'),
  });

  state.indexVersions.set('idx-old', {
    id: 'idx-old',
    documentId: 'doc-1',
    documentVersion: 1,
    indexVersion: 'idx-v1-old',
    status: 'active',
    builtAt: new Date('2026-03-01T00:00:00.000Z'),
    activatedAt: new Date('2026-03-01T00:10:00.000Z'),
  });
  state.indexVersions.set('idx-new', {
    id: 'idx-new',
    documentId: 'doc-1',
    documentVersion: 1,
    indexVersion: 'idx-v1-new',
    status: 'building',
    builtAt: new Date('2026-03-10T00:00:00.000Z'),
    activatedAt: null,
  });

  state.chunks = [
    {
      id: 'chunk-old',
      documentId: 'doc-1',
      version: 1,
      indexVersionId: 'idx-old',
      chunkIndex: 0,
      content: 'old build chunk',
    },
    {
      id: 'chunk-new',
      documentId: 'doc-1',
      version: 1,
      indexVersionId: 'idx-new',
      chunkIndex: 0,
      content: 'new build chunk',
    },
  ];

  state.vectors = [
    {
      id: 'vec-old',
      documentId: 'doc-1',
      knowledgeBaseId: 'kb-1',
      indexVersionId: 'idx-old',
      content: 'old build chunk',
      score: 0.95,
      chunkIndex: 0,
      isDeleted: false,
    },
    {
      id: 'vec-new',
      documentId: 'doc-1',
      knowledgeBaseId: 'kb-1',
      indexVersionId: 'idx-new',
      content: 'new build chunk',
      score: 0.91,
      chunkIndex: 0,
      isDeleted: false,
    },
  ];
}

vi.mock('@core/db/db.utils', () => ({
  withTransaction: async (callback: (tx: unknown) => Promise<unknown>, tx?: unknown) =>
    callback(tx ?? {}),
  afterTransactionCommit: async (callback: () => Promise<void>) => callback(),
}));

vi.mock('@config/env', () => ({
  documentConfig: configState.documentConfig,
  backfillConfig: configState.backfillConfig,
  ragConfig: {
    searchOverfetchFactor: 2,
    searchMaxCandidates: 100,
  },
}));

vi.mock('@core/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@modules/document-index/repositories/document-index-version.repository', () => ({
  documentIndexVersionRepository: {
    findById: vi.fn(async (id: string) => state.indexVersions.get(id)),
    update: vi.fn(async (id: string, data: Record<string, unknown>) => {
      const current = state.indexVersions.get(id);
      if (!current) return undefined;
      const next = { ...current, ...data };
      state.indexVersions.set(id, next);
      return next;
    }),
    supersedeActiveByDocumentId: vi.fn(async (documentId: string, keepIndexVersionId?: string) => {
      for (const [id, version] of state.indexVersions.entries()) {
        if (version.documentId !== documentId) continue;
        if (version.status !== 'active') continue;
        if (keepIndexVersionId && id === keepIndexVersionId) continue;
        state.indexVersions.set(id, { ...version, status: 'superseded' });
      }
    }),
    listCleanupCandidates: vi.fn(async (builtBefore: Date, limit: number) => {
      const activeByDocument = new Map(
        [...state.documents.values()].map((doc) => [
          doc.id as string,
          doc.activeIndexVersionId as string | null,
        ])
      );

      return [...state.indexVersions.values()]
        .filter((version) => {
          const status = version.status as string;
          const activeIndexVersionId = activeByDocument.get(version.documentId as string);
          return (
            (status === 'superseded' || status === 'failed') &&
            (version.builtAt as Date) < builtBefore &&
            activeIndexVersionId !== version.id
          );
        })
        .sort((a, b) => +(a.builtAt as Date) - +(b.builtAt as Date))
        .slice(0, limit)
        .map((version) => ({
          indexVersionId: version.id as string,
          documentId: version.documentId as string,
          documentVersion: version.documentVersion as number,
          knowledgeBaseId: 'kb-1',
          status: version.status as 'superseded' | 'failed',
          builtAt: version.builtAt as Date,
        }));
    }),
    deleteById: vi.fn(async (id: string) => {
      state.indexVersions.delete(id);
      state.chunks = state.chunks.filter((chunk) => chunk.indexVersionId !== id);
    }),
  },
}));

vi.mock('@modules/document', () => ({
  documentRepository: {
    findById: vi.fn(async (id: string) => state.documents.get(id)),
    update: vi.fn(async (id: string, data: Record<string, unknown>) => {
      const current = state.documents.get(id);
      if (!current) return undefined;
      const next = { ...current, ...data };
      state.documents.set(id, next);
      return next;
    }),
    publishBuild: vi.fn(
      async (input: {
        documentId: string;
        activeIndexVersionId: string;
        expectedPublishGeneration: number;
        chunkCount: number;
      }) => {
        const current = state.documents.get(input.documentId);
        if (!current) return false;
        if ((current.publishGeneration as number) !== input.expectedPublishGeneration) {
          return false;
        }
        state.documents.set(input.documentId, {
          ...current,
          activeIndexVersionId: input.activeIndexVersionId,
          processingStatus: 'completed',
          processingError: null,
          processingStartedAt: null,
          chunkCount: input.chunkCount,
        });
        return true;
      }
    ),
    listStaleProcessingDocuments: vi.fn(async (staleBefore: Date) =>
      [...state.documents.values()]
        .filter(
          (doc) =>
            doc.processingStatus === 'processing' &&
            doc.processingStartedAt instanceof Date &&
            (doc.processingStartedAt as Date) < staleBefore
        )
        .map((doc) => ({
          id: doc.id as string,
          userId: doc.userId as string,
          knowledgeBaseId: doc.knowledgeBaseId as string,
          title: 'Fixture Document',
          currentVersion: doc.currentVersion as number,
          publishGeneration: doc.publishGeneration as number,
          processingStartedAt: doc.processingStartedAt as Date,
        }))
    ),
    resetStaleProcessingDocument: vi.fn(async (id: string, staleBefore: Date) => {
      const current = state.documents.get(id);
      if (
        !current ||
        current.processingStatus !== 'processing' ||
        !(current.processingStartedAt instanceof Date) ||
        !((current.processingStartedAt as Date) < staleBefore)
      ) {
        return false;
      }
      state.documents.set(id, {
        ...current,
        processingStatus: 'pending',
        processingError: null,
        processingStartedAt: null,
        publishGeneration: (current.publishGeneration as number) + 1,
      });
      return true;
    }),
    getActiveIndexVersionMap: vi.fn(async (ids: string[]) => {
      return new Map(
        ids.map((id) => [
          id,
          (state.documents.get(id)?.activeIndexVersionId as string | null) ?? null,
        ])
      );
    }),
  },
  documentChunkRepository: {
    countByIndexVersionId: vi.fn(
      async (indexVersionId: string) =>
        state.chunks.filter((chunk) => chunk.indexVersionId === indexVersionId).length
    ),
  },
}));

vi.mock('@modules/document/public/repositories', () => ({
  documentRepository: {
    listBackfillCandidates: vi.fn(
      async (options?: {
        knowledgeBaseId?: string;
        documentType?: string;
        includeIndexed?: boolean;
        includeProcessing?: boolean;
        excludeRunId?: string;
        limit?: number;
        offset?: number;
      }) => {
        let documents = [...state.documents.values()];
        if (options?.knowledgeBaseId) {
          documents = documents.filter((doc) => doc.knowledgeBaseId === options.knowledgeBaseId);
        }
        if (options?.documentType) {
          documents = documents.filter((doc) => doc.documentType === options.documentType);
        }
        if (!options?.includeIndexed) {
          documents = documents.filter((doc) => !doc.activeIndexVersionId);
        }
        if (!options?.includeProcessing) {
          documents = documents.filter((doc) => doc.processingStatus !== 'processing');
        }
        if (options?.excludeRunId) {
          const excludedDocumentIds = new Set(
            [...state.backfillItems.values()]
              .filter((item) => item.runId === options.excludeRunId)
              .map((item) => item.documentId as string)
          );
          documents = documents.filter((doc) => !excludedDocumentIds.has(doc.id as string));
        }

        documents = documents.sort((a, b) => +(b.updatedAt as Date) - +(a.updatedAt as Date));

        const offset = options?.offset ?? 0;
        const limit = options?.limit ?? 100;
        const sliced = documents.slice(offset, offset + limit);
        return {
          documents: sliced as never[],
          hasMore: offset + limit < documents.length,
        };
      }
    ),
    countBackfillCandidates: vi.fn(
      async (options?: {
        knowledgeBaseId?: string;
        documentType?: string;
        includeIndexed?: boolean;
        includeProcessing?: boolean;
      }) => {
        let documents = [...state.documents.values()];
        if (options?.knowledgeBaseId) {
          documents = documents.filter((doc) => doc.knowledgeBaseId === options.knowledgeBaseId);
        }
        if (options?.documentType) {
          documents = documents.filter((doc) => doc.documentType === options.documentType);
        }
        if (!options?.includeIndexed) {
          documents = documents.filter((doc) => !doc.activeIndexVersionId);
        }
        if (!options?.includeProcessing) {
          documents = documents.filter((doc) => doc.processingStatus !== 'processing');
        }
        return documents.length;
      }
    ),
  },
}));

vi.mock('@modules/rag/services/processing.service', () => ({
  processingService: {
    releaseProcessingLock: vi.fn(),
  },
}));

vi.mock('@modules/document-index/services/document-index-cache.service', () => ({
  documentIndexCacheService: {
    invalidateDocumentCaches: vi.fn(async () => undefined),
    invalidateQueryCaches: vi.fn(async () => undefined),
  },
}));

vi.mock('@modules/knowledge-base', () => ({
  knowledgeBaseService: {
    getEmbeddingConfig: vi.fn(async () => ({
      provider: 'openai',
      dimensions: 1536,
      collectionName: 'collection-1',
    })),
  },
}));

vi.mock('@modules/vector', () => ({
  ensureCollection: vi.fn(async () => undefined),
  vectorRepository: {
    deleteByIndexVersionId: vi.fn(async (_collectionName: string, indexVersionId: string) => {
      let found = false;
      state.vectors = state.vectors.map((vector) => {
        if (vector.indexVersionId !== indexVersionId) return vector;
        found = true;
        return { ...vector, isDeleted: true };
      });
      state.vectors = state.vectors.filter((vector) => vector.indexVersionId !== indexVersionId);
      return found;
    }),
    search: vi.fn(
      async (
        _collectionName: string,
        _vector: number[],
        userId: string,
        options?: { knowledgeBaseId?: string }
      ) =>
        state.vectors
          .filter((vector) => (vector.userId ? vector.userId === userId : true))
          .filter((vector) => !vector.isDeleted)
          .filter(
            (vector) =>
              !options?.knowledgeBaseId || vector.knowledgeBaseId === options.knowledgeBaseId
          )
          .map((vector) => ({
            id: vector.id as string,
            documentId: vector.documentId as string,
            knowledgeBaseId: vector.knowledgeBaseId as string,
            content: vector.content as string,
            score: vector.score as number,
            chunkIndex: vector.chunkIndex as number,
            indexVersionId: vector.indexVersionId as string,
          }))
          .sort((a, b) => b.score - a.score)
    ),
  },
}));

vi.mock('@modules/embedding', () => ({
  getEmbeddingProviderByType: vi.fn(() => ({
    embed: vi.fn(async () => [0.1, 0.2, 0.3]),
  })),
}));

vi.mock('@modules/rag/queue/document-processing.queue', () => ({
  enqueueDocumentProcessing: vi.fn(
    async (documentId: string, userId: string, options: Record<string, unknown>) => {
      const jobId = `job-${documentId}-v${options.targetDocumentVersion as number}`;
      state.queuedJobs.push({ jobId, documentId, userId, ...options });
      return jobId;
    }
  ),
}));

vi.mock('@modules/document-index/services/document-index-backfill-progress.service', () => ({
  documentIndexBackfillProgressService: {
    createRun: vi.fn(async (options: Record<string, unknown>) => {
      const run = {
        id: 'run-1',
        status: 'running',
        knowledgeBaseId: options.knowledgeBaseId ?? null,
        documentType: options.documentType ?? null,
        includeIndexed: options.includeIndexed ?? false,
        includeProcessing: options.includeProcessing ?? false,
        batchSize: options.batchSize,
        enqueueDelayMs: options.enqueueDelayMs,
        candidateCount: options.candidateCount,
        cursorOffset: options.cursorOffset ?? 0,
        hasMore: true,
        trigger: options.trigger ?? 'manual',
      };
      state.backfillRuns.set(run.id, run);
      return run;
    }),
    ensureRunAvailable: vi.fn(async (runId: string) => {
      const run = state.backfillRuns.get(runId);
      if (!run) throw new Error(`Run not found: ${runId}`);
      return run;
    }),
    ensureItem: vi.fn(async (params: Record<string, unknown>) => {
      const key = `${params.runId}:${params.documentId}`;
      const existing = state.backfillItems.get(key);
      if (existing) return existing;
      const item = {
        id: `item-${params.documentId}`,
        runId: params.runId,
        documentId: params.documentId,
        userId: params.userId,
        knowledgeBaseId: params.knowledgeBaseId,
        documentVersion: params.documentVersion,
        status: 'pending',
        jobId: null,
        error: null,
      };
      state.backfillItems.set(key, item);
      return item;
    }),
    markEnqueued: vi.fn(async (params: Record<string, unknown>) => {
      const key = `${params.runId}:${params.documentId}`;
      const item = state.backfillItems.get(key);
      if (!item) return;
      state.backfillItems.set(key, {
        ...item,
        status: 'enqueued',
        jobId: params.jobId ?? null,
      });
    }),
    recordOutcome: vi.fn(async (params: Record<string, unknown>) => {
      const key = `${params.runId}:${params.documentId}`;
      const item = state.backfillItems.get(key);
      if (!item) return;
      state.backfillItems.set(key, {
        ...item,
        status: params.outcome,
        error: params.error ?? null,
      });
    }),
    updateCursor: vi.fn(async (params: Record<string, unknown>) => {
      const run = state.backfillRuns.get(params.runId as string);
      if (!run) return;
      state.backfillRuns.set(params.runId as string, {
        ...run,
        cursorOffset: params.cursorOffset,
        hasMore: params.hasMore,
      });
    }),
    getRun: vi.fn(),
    listRecentRuns: vi.fn(),
    getLatestActiveRun: vi.fn(async () => undefined),
    touchRunError: vi.fn(),
  },
}));

describe('immutable build publish and GC integration', () => {
  beforeEach(() => {
    vi.resetModules();
    resetState();
    configState.documentConfig.processingRecoveryRequeueEnabled = false;
  });

  it('publishes a newer build, cleans the superseded build, and keeps active search results intact', async () => {
    const { documentIndexActivationService } =
      await import('@modules/document-index/services/document-index-activation.service');
    const { documentIndexArtifactCleanupService } =
      await import('@modules/document-index/services/document-index-artifact-cleanup.service');
    const { searchService } = await import('@modules/rag/services/search.service');

    await documentIndexActivationService.activateVersion('idx-new');

    expect(state.documents.get('doc-1')?.activeIndexVersionId).toBe('idx-new');
    expect(state.indexVersions.get('idx-old')?.status).toBe('superseded');
    expect(state.indexVersions.get('idx-new')?.status).toBe('active');

    const cleanupResult = await documentIndexArtifactCleanupService.cleanup(
      new Date('2026-03-20T00:00:00.000Z')
    );

    expect(cleanupResult.cleanedIndexVersionIds).toEqual(['idx-old']);
    expect(state.indexVersions.has('idx-old')).toBe(false);
    expect(state.indexVersions.has('idx-new')).toBe(true);
    expect(state.chunks.some((chunk) => chunk.indexVersionId === 'idx-old')).toBe(false);
    expect(state.chunks.some((chunk) => chunk.indexVersionId === 'idx-new')).toBe(true);
    expect(state.documents.get('doc-1')?.activeIndexVersionId).toBe('idx-new');

    const results = await searchService.searchInKnowledgeBase({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      query: 'hello',
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      documentId: 'doc-1',
      indexVersionId: 'idx-new',
      content: 'new build chunk',
    });
  });

  it('blocks stale publish after recovery increments publish generation', async () => {
    state.documents.set('doc-1', {
      ...state.documents.get('doc-1'),
      activeIndexVersionId: 'idx-old',
      processingStatus: 'processing',
      processingStartedAt: new Date('2026-03-10T00:00:00.000Z'),
      publishGeneration: 1,
    });
    state.indexVersions.set('idx-stale', {
      id: 'idx-stale',
      documentId: 'doc-1',
      documentVersion: 1,
      indexVersion: 'idx-v1-stale',
      status: 'building',
      builtAt: new Date('2026-03-10T01:00:00.000Z'),
      activatedAt: null,
    });

    const { processingRecoveryService } =
      await import('@modules/rag/services/processing-recovery.service');
    const { documentIndexActivationService } =
      await import('@modules/document-index/services/document-index-activation.service');

    const recoveryResult = await processingRecoveryService.recoverStaleProcessing(
      new Date('2026-03-12T00:00:00.000Z')
    );
    expect(recoveryResult.recoveredDocumentIds).toEqual(['doc-1']);
    expect(state.documents.get('doc-1')?.publishGeneration).toBe(2);
    expect(state.documents.get('doc-1')?.activeIndexVersionId).toBe('idx-old');

    const activationResult = await documentIndexActivationService.activateVersion('idx-stale', {
      expectedPublishGeneration: 1,
      chunkCount: 2,
      knowledgeBaseId: 'kb-1',
      chunkDelta: 2,
    });

    expect(activationResult).toBeUndefined();
    expect(state.documents.get('doc-1')?.activeIndexVersionId).toBe('idx-old');
    expect(state.indexVersions.get('idx-stale')?.status).toBe('superseded');
  });

  it('keeps an old backfill target from publishing after version switch and recovery', async () => {
    const { documentIndexBackfillService } =
      await import('@modules/document-index/services/document-index-backfill.service');
    const { processingRecoveryService } =
      await import('@modules/rag/services/processing-recovery.service');
    const { documentIndexActivationService } =
      await import('@modules/document-index/services/document-index-activation.service');

    const backfillResult = await documentIndexBackfillService.enqueueBackfill({
      knowledgeBaseId: 'kb-1',
      includeIndexed: true,
      trigger: 'manual',
      createdBy: 'user-1',
    });

    expect(backfillResult.runId).toBe('run-1');
    expect(state.queuedJobs).toHaveLength(1);
    expect(state.queuedJobs[0]).toMatchObject({
      documentId: 'doc-1',
      userId: 'user-1',
      targetDocumentVersion: 1,
      reason: 'backfill',
      backfillRunId: 'run-1',
    });

    state.documents.set('doc-1', {
      ...state.documents.get('doc-1'),
      currentVersion: 2,
      activeIndexVersionId: 'idx-v2-active',
      processingStatus: 'processing',
      processingStartedAt: new Date('2026-03-10T02:00:00.000Z'),
      publishGeneration: 1,
      updatedAt: new Date('2026-03-11T00:00:00.000Z'),
    });
    state.indexVersions.set('idx-old', {
      ...state.indexVersions.get('idx-old'),
      status: 'superseded',
    });
    state.indexVersions.set('idx-v2-active', {
      id: 'idx-v2-active',
      documentId: 'doc-1',
      documentVersion: 2,
      indexVersion: 'idx-v2-active',
      status: 'active',
      builtAt: new Date('2026-03-11T00:00:00.000Z'),
      activatedAt: new Date('2026-03-11T00:10:00.000Z'),
    });
    state.indexVersions.set('idx-backfill-v1', {
      id: 'idx-backfill-v1',
      documentId: 'doc-1',
      documentVersion: 1,
      indexVersion: 'idx-backfill-v1',
      status: 'building',
      builtAt: new Date('2026-03-10T01:00:00.000Z'),
      activatedAt: null,
    });

    const recoveryResult = await processingRecoveryService.recoverStaleProcessing(
      new Date('2026-03-12T00:00:00.000Z')
    );
    expect(recoveryResult.recoveredDocumentIds).toEqual(['doc-1']);
    expect(state.documents.get('doc-1')?.publishGeneration).toBe(2);
    expect(state.documents.get('doc-1')?.currentVersion).toBe(2);
    expect(state.documents.get('doc-1')?.activeIndexVersionId).toBe('idx-v2-active');

    const activationResult = await documentIndexActivationService.activateVersion(
      'idx-backfill-v1',
      {
        expectedPublishGeneration: 1,
        chunkCount: 1,
        knowledgeBaseId: 'kb-1',
        chunkDelta: 0,
      }
    );

    expect(activationResult).toBeUndefined();
    expect(state.documents.get('doc-1')?.activeIndexVersionId).toBe('idx-v2-active');
    expect(state.documents.get('doc-1')?.currentVersion).toBe(2);
    expect(state.indexVersions.get('idx-backfill-v1')?.status).toBe('superseded');
  });

  it('survives repeated recovery across consecutive version switches and delayed GC keeps only the latest active build', async () => {
    const { documentIndexBackfillService } =
      await import('@modules/document-index/services/document-index-backfill.service');
    const { processingRecoveryService } =
      await import('@modules/rag/services/processing-recovery.service');
    const { documentIndexActivationService } =
      await import('@modules/document-index/services/document-index-activation.service');
    const { documentIndexArtifactCleanupService } =
      await import('@modules/document-index/services/document-index-artifact-cleanup.service');
    const { searchService } = await import('@modules/rag/services/search.service');

    const backfillResult = await documentIndexBackfillService.enqueueBackfill({
      knowledgeBaseId: 'kb-1',
      includeIndexed: true,
      trigger: 'manual',
      createdBy: 'user-1',
    });

    expect(backfillResult.runId).toBe('run-1');
    expect(state.queuedJobs[0]).toMatchObject({
      documentId: 'doc-1',
      targetDocumentVersion: 1,
    });

    state.indexVersions.set('idx-backfill-v1', {
      id: 'idx-backfill-v1',
      documentId: 'doc-1',
      documentVersion: 1,
      indexVersion: 'idx-backfill-v1',
      status: 'building',
      builtAt: new Date('2026-03-10T01:00:00.000Z'),
      activatedAt: null,
    });
    addBuildArtifacts({
      indexVersionId: 'idx-backfill-v1',
      documentVersion: 1,
      content: 'backfill v1 chunk',
      score: 0.94,
    });

    state.documents.set('doc-1', {
      ...state.documents.get('doc-1'),
      processingStatus: 'processing',
      processingStartedAt: new Date('2026-03-10T02:00:00.000Z'),
      publishGeneration: 1,
    });

    const firstRecovery = await processingRecoveryService.recoverStaleProcessing(
      new Date('2026-03-12T00:00:00.000Z')
    );
    expect(firstRecovery.recoveredDocumentIds).toEqual(['doc-1']);
    expect(state.documents.get('doc-1')?.publishGeneration).toBe(2);

    const staleV1Publish = await documentIndexActivationService.activateVersion('idx-backfill-v1', {
      expectedPublishGeneration: 1,
      chunkCount: 1,
      knowledgeBaseId: 'kb-1',
      chunkDelta: 0,
    });
    expect(staleV1Publish).toBeUndefined();
    expect(state.documents.get('doc-1')?.activeIndexVersionId).toBe('idx-old');
    expect(state.indexVersions.get('idx-backfill-v1')?.status).toBe('superseded');

    state.documents.set('doc-1', {
      ...state.documents.get('doc-1'),
      currentVersion: 2,
      publishGeneration: 2,
      activeIndexVersionId: 'idx-old',
      updatedAt: new Date('2026-03-12T01:00:00.000Z'),
    });
    state.indexVersions.set('idx-v2-active', {
      id: 'idx-v2-active',
      documentId: 'doc-1',
      documentVersion: 2,
      indexVersion: 'idx-v2-active',
      status: 'building',
      builtAt: new Date('2026-03-12T01:00:00.000Z'),
      activatedAt: null,
    });
    addBuildArtifacts({
      indexVersionId: 'idx-v2-active',
      documentVersion: 2,
      content: 'version 2 active chunk',
      score: 0.92,
    });

    const v2Publish = await documentIndexActivationService.activateVersion('idx-v2-active', {
      expectedPublishGeneration: 2,
      chunkCount: 1,
      knowledgeBaseId: 'kb-1',
      chunkDelta: 0,
    });
    expect(v2Publish).toEqual(expect.objectContaining({ id: 'idx-v2-active', status: 'active' }));
    expect(state.documents.get('doc-1')?.activeIndexVersionId).toBe('idx-v2-active');
    expect(state.indexVersions.get('idx-old')?.status).toBe('superseded');

    state.indexVersions.set('idx-v2-stale', {
      id: 'idx-v2-stale',
      documentId: 'doc-1',
      documentVersion: 2,
      indexVersion: 'idx-v2-stale',
      status: 'building',
      builtAt: new Date('2026-03-12T02:00:00.000Z'),
      activatedAt: null,
    });
    addBuildArtifacts({
      indexVersionId: 'idx-v2-stale',
      documentVersion: 2,
      content: 'version 2 stale chunk',
      score: 0.9,
    });

    state.documents.set('doc-1', {
      ...state.documents.get('doc-1'),
      processingStatus: 'processing',
      processingStartedAt: new Date('2026-03-12T02:30:00.000Z'),
      publishGeneration: 3,
    });

    const secondRecovery = await processingRecoveryService.recoverStaleProcessing(
      new Date('2026-03-13T00:00:00.000Z')
    );
    expect(secondRecovery.recoveredDocumentIds).toEqual(['doc-1']);
    expect(state.documents.get('doc-1')?.publishGeneration).toBe(4);
    expect(state.documents.get('doc-1')?.activeIndexVersionId).toBe('idx-v2-active');

    const staleV2Publish = await documentIndexActivationService.activateVersion('idx-v2-stale', {
      expectedPublishGeneration: 3,
      chunkCount: 1,
      knowledgeBaseId: 'kb-1',
      chunkDelta: 0,
    });
    expect(staleV2Publish).toBeUndefined();
    expect(state.indexVersions.get('idx-v2-stale')?.status).toBe('superseded');

    state.documents.set('doc-1', {
      ...state.documents.get('doc-1'),
      currentVersion: 3,
      publishGeneration: 4,
      updatedAt: new Date('2026-03-13T01:00:00.000Z'),
    });
    state.indexVersions.set('idx-v3-active', {
      id: 'idx-v3-active',
      documentId: 'doc-1',
      documentVersion: 3,
      indexVersion: 'idx-v3-active',
      status: 'building',
      builtAt: new Date('2026-03-13T01:00:00.000Z'),
      activatedAt: null,
    });
    addBuildArtifacts({
      indexVersionId: 'idx-v3-active',
      documentVersion: 3,
      content: 'version 3 active chunk',
      score: 0.97,
    });

    const v3Publish = await documentIndexActivationService.activateVersion('idx-v3-active', {
      expectedPublishGeneration: 4,
      chunkCount: 1,
      knowledgeBaseId: 'kb-1',
      chunkDelta: 0,
    });
    expect(v3Publish).toEqual(expect.objectContaining({ id: 'idx-v3-active', status: 'active' }));
    expect(state.documents.get('doc-1')?.activeIndexVersionId).toBe('idx-v3-active');
    expect(state.documents.get('doc-1')?.currentVersion).toBe(3);
    expect(state.indexVersions.get('idx-v2-active')?.status).toBe('superseded');

    const cleanupResult = await documentIndexArtifactCleanupService.cleanup(
      new Date('2026-03-25T00:00:00.000Z')
    );

    expect(cleanupResult.cleanedIndexVersionIds.sort()).toEqual(
      ['idx-backfill-v1', 'idx-old', 'idx-v2-active', 'idx-v2-stale'].sort()
    );
    expect(state.indexVersions.has('idx-v3-active')).toBe(true);
    expect(state.indexVersions.has('idx-old')).toBe(false);
    expect(state.indexVersions.has('idx-backfill-v1')).toBe(false);
    expect(state.indexVersions.has('idx-v2-active')).toBe(false);
    expect(state.indexVersions.has('idx-v2-stale')).toBe(false);
    expect(state.documents.get('doc-1')?.activeIndexVersionId).toBe('idx-v3-active');

    const results = await searchService.searchInKnowledgeBase({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      query: 'hello',
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      documentId: 'doc-1',
      indexVersionId: 'idx-v3-active',
      content: 'version 3 active chunk',
    });
  });

  it('keeps stale backfill and stale recovery reruns from publishing after repeated version switches, then activates the latest recovery rerun', async () => {
    configState.documentConfig.processingRecoveryRequeueEnabled = true;

    const { documentIndexBackfillService } =
      await import('@modules/document-index/services/document-index-backfill.service');
    const { processingRecoveryService } =
      await import('@modules/rag/services/processing-recovery.service');
    const { documentIndexActivationService } =
      await import('@modules/document-index/services/document-index-activation.service');
    const { documentIndexArtifactCleanupService } =
      await import('@modules/document-index/services/document-index-artifact-cleanup.service');
    const { searchService } = await import('@modules/rag/services/search.service');

    const backfillResult = await documentIndexBackfillService.enqueueBackfill({
      knowledgeBaseId: 'kb-1',
      includeIndexed: true,
      trigger: 'manual',
      createdBy: 'user-1',
    });

    expect(backfillResult.runId).toBe('run-1');
    expect(state.queuedJobs[0]).toMatchObject({
      documentId: 'doc-1',
      userId: 'user-1',
      targetDocumentVersion: 1,
      reason: 'backfill',
      backfillRunId: 'run-1',
    });

    state.indexVersions.set('idx-backfill-v1', {
      id: 'idx-backfill-v1',
      documentId: 'doc-1',
      documentVersion: 1,
      indexVersion: 'idx-backfill-v1',
      status: 'building',
      builtAt: new Date('2026-03-10T01:00:00.000Z'),
      activatedAt: null,
    });
    addBuildArtifacts({
      indexVersionId: 'idx-backfill-v1',
      documentVersion: 1,
      content: 'backfill v1 chunk',
      score: 0.9,
    });

    state.documents.set('doc-1', {
      ...state.documents.get('doc-1'),
      currentVersion: 2,
      processingStatus: 'processing',
      processingStartedAt: new Date('2026-03-10T02:00:00.000Z'),
      publishGeneration: 1,
      updatedAt: new Date('2026-03-11T00:00:00.000Z'),
    });

    const firstRecovery = await processingRecoveryService.recoverStaleProcessing(
      new Date('2026-03-12T00:00:00.000Z')
    );
    expect(firstRecovery).toMatchObject({
      recoveredDocumentIds: ['doc-1'],
      requeuedDocumentIds: ['doc-1'],
      requeuedCount: 1,
    });
    expect(state.queuedJobs[1]).toMatchObject({
      documentId: 'doc-1',
      userId: 'user-1',
      targetDocumentVersion: 2,
      reason: 'recovery',
      jobIdSuffix: 'recovery-g2',
    });

    state.indexVersions.set('idx-recovery-v2', {
      id: 'idx-recovery-v2',
      documentId: 'doc-1',
      documentVersion: 2,
      indexVersion: 'idx-recovery-v2',
      status: 'building',
      builtAt: new Date('2026-03-11T01:00:00.000Z'),
      activatedAt: null,
    });
    addBuildArtifacts({
      indexVersionId: 'idx-recovery-v2',
      documentVersion: 2,
      content: 'recovery v2 chunk',
      score: 0.93,
    });

    state.documents.set('doc-1', {
      ...state.documents.get('doc-1'),
      currentVersion: 3,
      processingStatus: 'processing',
      processingStartedAt: new Date('2026-03-12T02:00:00.000Z'),
      publishGeneration: 3,
      updatedAt: new Date('2026-03-12T03:00:00.000Z'),
    });

    const secondRecovery = await processingRecoveryService.recoverStaleProcessing(
      new Date('2026-03-13T00:00:00.000Z')
    );
    expect(secondRecovery).toMatchObject({
      recoveredDocumentIds: ['doc-1'],
      requeuedDocumentIds: ['doc-1'],
      requeuedCount: 1,
    });
    expect(state.queuedJobs[2]).toMatchObject({
      documentId: 'doc-1',
      userId: 'user-1',
      targetDocumentVersion: 3,
      reason: 'recovery',
      jobIdSuffix: 'recovery-g4',
    });

    state.indexVersions.set('idx-recovery-v3', {
      id: 'idx-recovery-v3',
      documentId: 'doc-1',
      documentVersion: 3,
      indexVersion: 'idx-recovery-v3',
      status: 'building',
      builtAt: new Date('2026-03-13T01:00:00.000Z'),
      activatedAt: null,
    });
    addBuildArtifacts({
      indexVersionId: 'idx-recovery-v3',
      documentVersion: 3,
      content: 'recovery v3 chunk',
      score: 0.97,
    });

    const staleBackfillPublish = await documentIndexActivationService.activateVersion(
      'idx-backfill-v1',
      {
        expectedPublishGeneration: 1,
        chunkCount: 1,
        knowledgeBaseId: 'kb-1',
        chunkDelta: 0,
      }
    );
    expect(staleBackfillPublish).toBeUndefined();
    expect(state.indexVersions.get('idx-backfill-v1')?.status).toBe('superseded');

    const staleRecoveryPublish = await documentIndexActivationService.activateVersion(
      'idx-recovery-v2',
      {
        expectedPublishGeneration: 2,
        chunkCount: 1,
        knowledgeBaseId: 'kb-1',
        chunkDelta: 0,
      }
    );
    expect(staleRecoveryPublish).toBeUndefined();
    expect(state.indexVersions.get('idx-recovery-v2')?.status).toBe('superseded');
    expect(state.documents.get('doc-1')?.activeIndexVersionId).toBe('idx-old');

    const latestRecoveryPublish = await documentIndexActivationService.activateVersion(
      'idx-recovery-v3',
      {
        expectedPublishGeneration: 4,
        chunkCount: 1,
        knowledgeBaseId: 'kb-1',
        chunkDelta: 0,
      }
    );
    expect(latestRecoveryPublish).toEqual(
      expect.objectContaining({ id: 'idx-recovery-v3', status: 'active' })
    );
    expect(state.documents.get('doc-1')).toMatchObject({
      currentVersion: 3,
      activeIndexVersionId: 'idx-recovery-v3',
      processingStatus: 'completed',
    });

    const cleanupResult = await documentIndexArtifactCleanupService.cleanup(
      new Date('2026-03-25T00:00:00.000Z')
    );
    expect(cleanupResult.cleanedIndexVersionIds.sort()).toEqual(
      ['idx-backfill-v1', 'idx-old', 'idx-recovery-v2'].sort()
    );
    expect(state.indexVersions.has('idx-recovery-v3')).toBe(true);
    expect(state.documents.get('doc-1')?.activeIndexVersionId).toBe('idx-recovery-v3');

    const results = await searchService.searchInKnowledgeBase({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      query: 'latest recovery',
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      documentId: 'doc-1',
      indexVersionId: 'idx-recovery-v3',
      content: 'recovery v3 chunk',
    });
  });
});
