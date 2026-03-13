import { and, asc, desc, eq, inArray, isNull, lt, ne, or } from 'drizzle-orm';
import { getDbContext, type Transaction } from '@core/db/db.utils';
import {
  documentIndexVersions,
  type DocumentIndexVersion,
  type NewDocumentIndexVersion,
} from '@core/db/schema/document/document-index-versions.schema';
import { documents } from '@core/db/schema/document/documents.schema';

export interface DocumentIndexCleanupCandidate {
  indexVersionId: string;
  documentId: string;
  documentVersion: number;
  knowledgeBaseId: string;
  status: DocumentIndexVersion['status'];
  builtAt: Date;
}

export const documentIndexVersionRepository = {
  async create(data: NewDocumentIndexVersion, tx?: Transaction): Promise<DocumentIndexVersion> {
    const ctx = getDbContext(tx);
    await ctx.insert(documentIndexVersions).values(data);
    const result = await ctx
      .select()
      .from(documentIndexVersions)
      .where(eq(documentIndexVersions.id, data.id))
      .limit(1);
    return result[0]!;
  },

  async findById(id: string, tx?: Transaction): Promise<DocumentIndexVersion | undefined> {
    const ctx = getDbContext(tx);
    const result = await ctx
      .select()
      .from(documentIndexVersions)
      .where(eq(documentIndexVersions.id, id))
      .limit(1);
    return result[0];
  },

  async findActiveByDocumentId(
    documentId: string,
    tx?: Transaction
  ): Promise<DocumentIndexVersion | undefined> {
    const ctx = getDbContext(tx);
    const result = await ctx
      .select()
      .from(documentIndexVersions)
      .where(
        and(
          eq(documentIndexVersions.documentId, documentId),
          eq(documentIndexVersions.status, 'active')
        )
      )
      .orderBy(desc(documentIndexVersions.activatedAt), desc(documentIndexVersions.builtAt))
      .limit(1);
    return result[0];
  },

  async findLatestByDocumentVersion(
    documentId: string,
    documentVersion: number,
    tx?: Transaction
  ): Promise<DocumentIndexVersion | undefined> {
    const ctx = getDbContext(tx);
    const result = await ctx
      .select()
      .from(documentIndexVersions)
      .where(
        and(
          eq(documentIndexVersions.documentId, documentId),
          eq(documentIndexVersions.documentVersion, documentVersion)
        )
      )
      .orderBy(desc(documentIndexVersions.builtAt))
      .limit(1);
    return result[0];
  },

  async listByDocumentId(documentId: string, tx?: Transaction): Promise<DocumentIndexVersion[]> {
    const ctx = getDbContext(tx);
    return ctx
      .select()
      .from(documentIndexVersions)
      .where(eq(documentIndexVersions.documentId, documentId))
      .orderBy(desc(documentIndexVersions.documentVersion), desc(documentIndexVersions.builtAt));
  },

  async listCleanupCandidates(
    builtBefore: Date,
    limit: number,
    tx?: Transaction
  ): Promise<DocumentIndexCleanupCandidate[]> {
    const ctx = getDbContext(tx);
    return ctx
      .select({
        indexVersionId: documentIndexVersions.id,
        documentId: documentIndexVersions.documentId,
        documentVersion: documentIndexVersions.documentVersion,
        knowledgeBaseId: documents.knowledgeBaseId,
        status: documentIndexVersions.status,
        builtAt: documentIndexVersions.builtAt,
      })
      .from(documentIndexVersions)
      .innerJoin(documents, eq(documents.id, documentIndexVersions.documentId))
      .where(
        and(
          inArray(documentIndexVersions.status, ['superseded', 'failed']),
          lt(documentIndexVersions.builtAt, builtBefore),
          or(
            isNull(documents.activeIndexVersionId),
            ne(documents.activeIndexVersionId, documentIndexVersions.id)
          )
        )
      )
      .orderBy(asc(documentIndexVersions.builtAt), asc(documentIndexVersions.id))
      .limit(limit);
  },

  async update(
    id: string,
    data: Partial<
      Pick<
        DocumentIndexVersion,
        | 'status'
        | 'routeMode'
        | 'parseMethod'
        | 'parserRuntime'
        | 'parseConfidence'
        | 'headingCount'
        | 'orphanNodeRatio'
        | 'pageCoverage'
        | 'parseDurationMs'
        | 'workerJobId'
        | 'error'
        | 'activatedAt'
      >
    >,
    tx?: Transaction
  ): Promise<DocumentIndexVersion | undefined> {
    const ctx = getDbContext(tx);
    await ctx.update(documentIndexVersions).set(data).where(eq(documentIndexVersions.id, id));
    return this.findById(id, tx);
  },

  async deleteById(id: string, tx?: Transaction): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx.delete(documentIndexVersions).where(eq(documentIndexVersions.id, id));
  },

  async supersedeActiveByDocumentId(
    documentId: string,
    keepIndexVersionId?: string,
    tx?: Transaction
  ): Promise<void> {
    const ctx = getDbContext(tx);
    const activeVersions = await ctx
      .select({ id: documentIndexVersions.id })
      .from(documentIndexVersions)
      .where(
        and(
          eq(documentIndexVersions.documentId, documentId),
          eq(documentIndexVersions.status, 'active')
        )
      );

    for (const version of activeVersions) {
      if (keepIndexVersionId && version.id === keepIndexVersionId) continue;
      await ctx
        .update(documentIndexVersions)
        .set({ status: 'superseded' })
        .where(eq(documentIndexVersions.id, version.id));
    }
  },
};
