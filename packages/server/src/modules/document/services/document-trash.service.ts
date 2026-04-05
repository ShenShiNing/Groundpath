import type {
  TrashListParams,
  TrashDocumentListItem,
  TrashListResponse,
  DocumentInfo,
} from '@groundpath/shared/types';
import type { Document } from '@core/db/schema/document/documents.schema';
import { buildCursorPagination, normalizePageSize } from '@core/utils';
import { documentRepository } from '../repositories/document.repository';
import type { RequestContext } from './document-upload.service';
import { documentLifecycleService, type ClearTrashResult } from './document-lifecycle.service';

function toDocumentListItem(doc: Document) {
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description,
    fileName: doc.fileName,
    fileSize: doc.fileSize,
    fileExtension: doc.fileExtension,
    documentType: doc.documentType,
    processingStatus: doc.processingStatus,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Convert database document to trash list item
 */
function toTrashDocumentListItem(doc: Document): TrashDocumentListItem {
  return {
    ...toDocumentListItem(doc),
    deletedAt: doc.deletedAt!,
  };
}

/**
 * Document trash service for trash/restore operations
 */
export const documentTrashService = {
  /**
   * List deleted documents (trash)
   */
  async listTrash(userId: string, params: TrashListParams): Promise<TrashListResponse> {
    const pageSize = normalizePageSize(params.pageSize);
    const { documents, total, hasMore, nextCursor } = await documentRepository.listDeleted(userId, {
      ...params,
      pageSize,
    });

    return {
      documents: documents.map(toTrashDocumentListItem),
      pagination: buildCursorPagination(total, pageSize, hasMore, nextCursor),
    };
  },

  /**
   * Restore a deleted document
   */
  async restore(documentId: string, userId: string, ctx?: RequestContext): Promise<DocumentInfo> {
    return documentLifecycleService.restore(documentId, userId, ctx);
  },

  /**
   * Permanently delete a document
   */
  async permanentDelete(documentId: string, userId: string, ctx?: RequestContext): Promise<void> {
    return documentLifecycleService.permanentDelete(documentId, userId, ctx);
  },

  /**
   * Permanently delete all documents in trash.
   * Best effort: continue deleting remaining documents when a single document fails.
   */
  async clearTrash(userId: string, ctx?: RequestContext): Promise<ClearTrashResult> {
    return documentLifecycleService.clearTrash(userId, ctx);
  },
};
