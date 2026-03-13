import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@core/db';
import { documents } from '@core/db/schema/document/documents.schema';
import { createLogger } from '@core/logger';

const logger = createLogger('processing.service');
const processingLocks = new Map<string, boolean>();

export async function acquireProcessingLock(documentId: string): Promise<boolean> {
  if (processingLocks.get(documentId)) {
    logger.warn({ documentId }, 'Document already processing (in-memory lock)');
    return false;
  }

  processingLocks.set(documentId, true);

  try {
    const processingStartedAt = new Date();
    const result = await db
      .update(documents)
      .set({
        processingStatus: 'processing',
        processingError: null,
        processingStartedAt,
        publishGeneration: sql`${documents.publishGeneration} + 1`,
      })
      .where(
        and(
          eq(documents.id, documentId),
          inArray(documents.processingStatus, ['pending', 'failed', 'completed'])
        )
      );

    if (result[0].affectedRows === 0) {
      processingLocks.delete(documentId);
      logger.warn({ documentId }, 'Document already processing (database lock)');
      return false;
    }

    return true;
  } catch (error) {
    processingLocks.delete(documentId);
    throw error;
  }
}

export function releaseProcessingLock(documentId: string): void {
  processingLocks.delete(documentId);
}
