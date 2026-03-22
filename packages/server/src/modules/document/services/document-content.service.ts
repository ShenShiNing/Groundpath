import { v4 as uuidv4 } from 'uuid';
import { DOCUMENT_ERROR_CODES } from '@groundpath/shared';
import type {
  DocumentInfo,
  DocumentContentResponse,
  SaveDocumentContentRequest,
} from '@groundpath/shared/types';
import type { Document } from '@core/db/schema/document/documents.schema';
import { withTransaction } from '@core/db/db.utils';
import { Errors } from '@core/errors';
import { documentConfig } from '@config/env';
import { documentRepository } from '../repositories/document.repository';
import { documentVersionRepository } from '../repositories/document-version.repository';
import { documentStorageService } from './document-storage.service';
import { createLogger } from '@core/logger';
import { logOperation } from '@core/logger/operation-logger';
import { dispatchDocumentProcessing } from '../ports/document-processing.port';
import { storageProvider } from '@modules/storage';
import type { RequestContext } from './document-upload.service';
import { toDocumentInfo } from './document-upload.service';

const logger = createLogger('document-content.service');

function documentNotFoundError(message: string = 'Document not found') {
  return Errors.auth(DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND', message, 404);
}

/**
 * Document content service for handling content read/write and download operations
 */
export const documentContentService = {
  /**
   * Get current content of a document (with ownership check)
   */
  async getContent(documentId: string, userId: string): Promise<DocumentContentResponse> {
    const document = await documentRepository.findByIdAndUser(documentId, userId);
    if (!document) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document not found',
        404
      );
    }

    const version = await documentVersionRepository.findByDocumentAndVersion(
      documentId,
      document.currentVersion
    );

    if (!version) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document version not found',
        404
      );
    }

    const isEditable = document.documentType === 'markdown' || document.documentType === 'text';
    let storageUrl: string | null = null;
    if (document.documentType === 'pdf') {
      storageUrl = `/api/documents/${documentId}/preview`;
    } else if (document.documentType === 'docx') {
      storageUrl = `/api/documents/${documentId}/download`;
    } else if (document.documentType === 'markdown' || document.documentType === 'text') {
      storageUrl = null;
    } else {
      storageUrl = storageProvider.getPublicUrl(version.storageKey);
    }

    // Determine if content was truncated based on document type limits
    const maxLength = isEditable
      ? documentConfig.textContentMaxLength
      : documentConfig.textPreviewMaxLength;
    const isTruncated = version.textContent !== null && version.textContent.length >= maxLength;

    return {
      id: document.id,
      title: document.title,
      fileName: version.fileName,
      documentType: document.documentType,
      textContent: version.textContent,
      currentVersion: document.currentVersion,
      processingStatus: document.processingStatus,
      isEditable,
      isTruncated,
      storageUrl,
    };
  },

  /**
   * Save document content (markdown/text only)
   */
  async saveContent(
    documentId: string,
    userId: string,
    data: SaveDocumentContentRequest,
    ctx?: RequestContext
  ): Promise<DocumentInfo> {
    const startTime = Date.now();
    const document = await documentRepository.findByIdAndUser(documentId, userId);
    if (!document) {
      throw documentNotFoundError();
    }

    const isEditable = document.documentType === 'markdown' || document.documentType === 'text';
    if (!isEditable) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.ACCESS_DENIED as 'ACCESS_DENIED',
        'Document type does not support editing',
        400
      );
    }

    const content = data.content ?? '';
    if (content.length > documentConfig.textContentMaxLength) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.FILE_TOO_LARGE as 'FILE_TOO_LARGE',
        'Content too large',
        400
      );
    }

    const buffer = Buffer.from(content, 'utf-8');
    const fallbackExtension = document.documentType === 'markdown' ? 'md' : 'txt';
    const fileExtension = document.fileExtension || fallbackExtension;
    const fileName =
      document.fileName && document.fileName.includes('.')
        ? document.fileName
        : `${document.title}.${fileExtension}`;
    const mimeType =
      document.mimeType || (document.documentType === 'markdown' ? 'text/markdown' : 'text/plain');

    const {
      storageKey,
      fileExtension: resolvedExtension,
      documentType,
      resolvedMimeType,
    } = await documentStorageService.uploadDocument(userId, {
      buffer,
      mimetype: mimeType,
      originalname: fileName,
    });

    const fileSize = buffer.length;

    let updated: Document | undefined;
    let versionContext:
      | {
          previousVersion: number;
          newVersion: number;
          title: string;
        }
      | undefined;
    try {
      updated = await withTransaction(async (tx) => {
        const lockedDocument = await documentRepository.lockByIdAndUser(documentId, userId, tx);
        if (!lockedDocument || lockedDocument.deletedAt) {
          throw documentNotFoundError();
        }

        const lockedIsEditable =
          lockedDocument.documentType === 'markdown' || lockedDocument.documentType === 'text';
        if (!lockedIsEditable) {
          throw Errors.auth(
            DOCUMENT_ERROR_CODES.ACCESS_DENIED as 'ACCESS_DENIED',
            'Document type does not support editing',
            400
          );
        }

        const newVersion = lockedDocument.currentVersion + 1;
        versionContext = {
          previousVersion: lockedDocument.currentVersion,
          newVersion,
          title: lockedDocument.title,
        };

        await documentVersionRepository.create(
          {
            id: uuidv4(),
            documentId: lockedDocument.id,
            version: newVersion,
            fileName,
            mimeType: resolvedMimeType,
            fileSize,
            fileExtension: resolvedExtension,
            documentType,
            storageKey,
            textContent: content,
            source: 'edit',
            changeNote: data.changeNote ?? null,
            createdBy: userId,
          },
          tx
        );

        return documentRepository.update(
          documentId,
          {
            currentVersion: newVersion,
            fileName,
            mimeType: resolvedMimeType,
            fileSize,
            fileExtension: resolvedExtension,
            documentType,
            processingStatus: 'pending',
            updatedBy: userId,
          },
          tx
        );
      });
    } catch (dbError) {
      logger.warn({ documentId, storageKey }, 'DB transaction failed, cleaning up uploaded file');
      try {
        await documentStorageService.deleteDocument(storageKey);
      } catch (cleanupErr) {
        logger.error(
          { documentId, storageKey, err: cleanupErr },
          'Failed to clean up orphaned storage file after DB error'
        );
      }
      throw dbError;
    }

    logOperation({
      userId,
      resourceType: 'document',
      resourceId: documentId,
      resourceName: versionContext?.title ?? document.title,
      action: 'document.update',
      description: `Edited document content: ${versionContext?.title ?? document.title}`,
      metadata: {
        previousVersion: versionContext?.previousVersion ?? document.currentVersion,
        newVersion: versionContext?.newVersion ?? document.currentVersion + 1,
        fileName,
        fileSize,
        changeNote: data.changeNote ?? null,
      },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });

    dispatchDocumentProcessing(documentId, userId, {
      targetDocumentVersion: versionContext?.newVersion ?? document.currentVersion + 1,
      reason: 'edit',
    }).catch((err) => {
      logger.warn({ documentId, err }, 'Failed to enqueue document processing after edit');
    });

    return toDocumentInfo(updated!);
  },

  /**
   * Get document download stream info
   */
  async getDownloadStream(
    documentId: string,
    userId: string,
    ctx?: RequestContext
  ): Promise<{
    body: AsyncIterable<Uint8Array>;
    fileName: string;
    contentType: string | undefined;
    contentLength: number | undefined;
  }> {
    const startTime = Date.now();
    const document = await documentRepository.findByIdAndUser(documentId, userId);
    if (!document) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document not found',
        404
      );
    }

    // Get storageKey from current version
    const version = await documentVersionRepository.findByDocumentAndVersion(
      documentId,
      document.currentVersion
    );
    if (!version) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND as 'DOCUMENT_NOT_FOUND',
        'Document version not found',
        404
      );
    }

    const stream = await documentStorageService.getDocumentStream(version.storageKey);

    // Log operation
    logOperation({
      userId,
      resourceType: 'document',
      resourceId: documentId,
      resourceName: document.title,
      action: 'document.download',
      description: `Downloaded document: ${document.fileName}`,
      metadata: {
        fileName: document.fileName,
        fileSize: document.fileSize,
        version: document.currentVersion,
      },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });

    return {
      ...stream,
      fileName: document.fileName,
    };
  },
};
