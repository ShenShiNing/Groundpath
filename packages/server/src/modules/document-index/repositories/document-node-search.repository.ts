import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@shared/db';
import { documents } from '@shared/db/schema/document/documents.schema';
import { documentNodes } from '@shared/db/schema/document/document-nodes.schema';
import { documentNodeContents } from '@shared/db/schema/document/document-node-contents.schema';
import { documentIndexVersions } from '@shared/db/schema/document/document-index-versions.schema';

export interface AccessibleNodeRow {
  nodeId: string;
  documentId: string;
  documentTitle: string;
  documentVersion: number;
  indexVersion: string;
  indexVersionId: string;
  nodeType: (typeof documentNodes.$inferSelect)['nodeType'];
  title: string | null;
  depth: number;
  sectionPath: string[] | null;
  pageStart: number | null;
  pageEnd: number | null;
  parentId: string | null;
  orderNo: number;
  stableLocator: string | null;
  content: string | null;
  contentPreview: string | null;
  tokenCount: number | null;
}

interface AccessFilter {
  userId: string;
  knowledgeBaseId?: string | null;
  documentIds?: string[];
}

function buildAccessConditions(filter: AccessFilter) {
  const conditions = [eq(documents.userId, filter.userId), isNull(documents.deletedAt)];

  if (filter.knowledgeBaseId) {
    conditions.push(eq(documents.knowledgeBaseId, filter.knowledgeBaseId));
  }

  if (filter.documentIds?.length) {
    conditions.push(inArray(documents.id, filter.documentIds));
  }

  return conditions;
}

function buildSearchConditions(terms: string[]) {
  const normalizedTerms = terms
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 0)
    .slice(0, 8);

  if (normalizedTerms.length === 0) return undefined;

  const termConditions = normalizedTerms.flatMap((term) => {
    const pattern = `%${term}%`;
    return [
      sql`LOWER(COALESCE(${documentNodes.title}, '')) LIKE ${pattern}`,
      sql`LOWER(COALESCE(${documentNodes.stableLocator}, '')) LIKE ${pattern}`,
      sql`LOWER(COALESCE(${documentNodeContents.contentPreview}, '')) LIKE ${pattern}`,
    ];
  });

  return or(...termConditions);
}

function getAccessibleNodeSelect() {
  return {
    nodeId: documentNodes.id,
    documentId: documents.id,
    documentTitle: documents.title,
    documentVersion: documentIndexVersions.documentVersion,
    indexVersion: documentIndexVersions.indexVersion,
    indexVersionId: documentNodes.indexVersionId,
    nodeType: documentNodes.nodeType,
    title: documentNodes.title,
    depth: documentNodes.depth,
    sectionPath: documentNodes.sectionPath,
    pageStart: documentNodes.pageStart,
    pageEnd: documentNodes.pageEnd,
    parentId: documentNodes.parentId,
    orderNo: documentNodes.orderNo,
    stableLocator: documentNodes.stableLocator,
    content: documentNodeContents.content,
    contentPreview: documentNodeContents.contentPreview,
    tokenCount: documentNodeContents.tokenCount,
  };
}

export const documentNodeSearchRepository = {
  async searchActiveNodes(
    filter: AccessFilter & { terms: string[]; limit?: number }
  ): Promise<AccessibleNodeRow[]> {
    const conditions = buildAccessConditions(filter);
    const searchCondition = buildSearchConditions(filter.terms);
    if (searchCondition) {
      conditions.push(searchCondition);
    }

    return db
      .select(getAccessibleNodeSelect())
      .from(documentNodes)
      .innerJoin(
        documents,
        and(
          eq(documents.id, documentNodes.documentId),
          eq(documents.activeIndexVersionId, documentNodes.indexVersionId)
        )
      )
      .innerJoin(documentIndexVersions, eq(documentIndexVersions.id, documentNodes.indexVersionId))
      .leftJoin(documentNodeContents, eq(documentNodeContents.nodeId, documentNodes.id))
      .where(and(...conditions))
      .limit(filter.limit ?? 50);
  },

  async getAccessibleNodesByIds(
    filter: AccessFilter & { nodeIds: string[] }
  ): Promise<AccessibleNodeRow[]> {
    if (filter.nodeIds.length === 0) return [];

    const conditions = buildAccessConditions(filter);
    conditions.push(inArray(documentNodes.id, filter.nodeIds));

    return db
      .select(getAccessibleNodeSelect())
      .from(documentNodes)
      .innerJoin(
        documents,
        and(
          eq(documents.id, documentNodes.documentId),
          eq(documents.activeIndexVersionId, documentNodes.indexVersionId)
        )
      )
      .innerJoin(documentIndexVersions, eq(documentIndexVersions.id, documentNodes.indexVersionId))
      .leftJoin(documentNodeContents, eq(documentNodeContents.nodeId, documentNodes.id))
      .where(and(...conditions));
  },
};
