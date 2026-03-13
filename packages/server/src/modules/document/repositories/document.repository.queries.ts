import { and, count, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@core/db';
import { documents } from '@core/db/schema/document/documents.schema';

export const documentRepositoryQueries = {
  async countByKnowledgeBaseId(knowledgeBaseId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(documents)
      .where(and(eq(documents.knowledgeBaseId, knowledgeBaseId), isNull(documents.deletedAt)));

    return result[0]?.count ?? 0;
  },

  async sumChunksByKnowledgeBaseId(knowledgeBaseId: string): Promise<number> {
    const result = await db
      .select({ total: sql<number>`COALESCE(SUM(${documents.chunkCount}), 0)` })
      .from(documents)
      .where(and(eq(documents.knowledgeBaseId, knowledgeBaseId), isNull(documents.deletedAt)));

    return result[0]?.total ?? 0;
  },

  async getTitlesByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }

    const result = await db
      .select({ id: documents.id, title: documents.title })
      .from(documents)
      .where(
        and(
          sql`${documents.id} IN (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`, `
          )})`,
          isNull(documents.deletedAt)
        )
      );

    return new Map(result.map((row) => [row.id, row.title]));
  },

  async getActiveIndexVersionMap(ids: string[]): Promise<Map<string, string | null>> {
    if (ids.length === 0) {
      return new Map();
    }

    const result = await db
      .select({ id: documents.id, activeIndexVersionId: documents.activeIndexVersionId })
      .from(documents)
      .where(
        and(
          sql`${documents.id} IN (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`, `
          )})`,
          isNull(documents.deletedAt)
        )
      );

    return new Map(result.map((row) => [row.id, row.activeIndexVersionId]));
  },
};
