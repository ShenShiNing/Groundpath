import { v4 as uuidv4 } from 'uuid';
import { DOCUMENT_ERROR_CODES, KNOWLEDGE_BASE_ERROR_CODES } from '@knowledge-agent/shared';
import type { DocumentInfo } from '@knowledge-agent/shared/types';
import type { Document } from '@shared/db/schema/document/documents.schema';
import { withTransaction } from '@shared/db/db.utils';
import { Errors } from '@shared/errors';
import { documentConfig } from '@config/env';
import { documentRepository } from '../repositories/document.repository';
import { documentVersionRepository } from '../repositories/document-version.repository';
import { documentStorageService } from './document-storage.service';
import { createLogger } from '@shared/logger';
import { logOperation } from '@shared/logger/operation-logger';
import { processingService } from '@modules/rag';
import { knowledgeBaseService } from '@modules/knowledge-base';

const logger = createLogger('document-upload.service');

/**
 * Request context for logging
 */
export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Convert database document to API document info
 */
export function toDocumentInfo(doc: Document): DocumentInfo {
  return {
    id: doc.id,
    userId: doc.userId,
    title: doc.title,
    description: doc.description,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    fileSize: doc.fileSize,
    fileExtension: doc.fileExtension,
    documentType: doc.documentType,
    currentVersion: doc.currentVersion,
    processingStatus: doc.processingStatus,
    chunkCount: doc.chunkCount,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Upload file input type
 */
export interface UploadFileInput {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

/**
 * Upload options
 */
export interface UploadOptions {
  title?: string;
  description?: string;
  knowledgeBaseId?: string;
}

/**
 * Document upload service for handling document uploads
 */
export const documentUploadService = {
  /**
   * Upload a new document
   */
  async upload(
    userId: string,
    file: UploadFileInput,
    options?: UploadOptions,
    ctx?: RequestContext
  ): Promise<DocumentInfo> {
    const startTime = Date.now();

    // knowledgeBaseId is required
    if (!options?.knowledgeBaseId) {
      throw Errors.auth(
        KNOWLEDGE_BASE_ERROR_CODES.KNOWLEDGE_BASE_NOT_FOUND as 'KNOWLEDGE_BASE_NOT_FOUND',
        'Knowledge base ID is required',
        400
      );
    }
    const knowledgeBaseId = options.knowledgeBaseId;

    // Validate knowledge base exists and belongs to user
    await knowledgeBaseService.validateOwnership(knowledgeBaseId, userId);

    // Validate file
    const validation = documentStorageService.validateFile(file);
    if (!validation.valid) {
      throw Errors.auth(
        DOCUMENT_ERROR_CODES.INVALID_FILE_TYPE as 'INVALID_FILE_TYPE',
        validation.error!,
        400
      );
    }

    // Upload to storage (outside transaction - will be cleaned up on failure)
    const { storageKey, fileExtension, documentType, resolvedMimeType } =
      await documentStorageService.uploadDocument(userId, file);

    // Extract text content for supported document types
    // - Editable files (markdown/text): use higher limit for full editing capability
    // - Preview files (pdf/docx): use lower limit, full content available via download
    let textContent: string | null = null;
    if (['markdown', 'text'].includes(documentType)) {
      textContent = file.buffer.toString('utf-8');
      if (textContent.length > documentConfig.textContentMaxLength) {
        textContent = textContent.substring(0, documentConfig.textContentMaxLength);
      }
    } else if (['pdf', 'docx'].includes(documentType)) {
      const extracted = await documentStorageService.extractTextContent(
        storageKey,
        documentType,
        documentConfig.textPreviewMaxLength
      );
      textContent = extracted.text;
    }

    const title = options?.title || file.originalname.replace(/\.[^/.]+$/, '');
    const docId = uuidv4();

    // Wrap all DB operations in a transaction for atomicity
    // If any step fails, the transaction rolls back and we clean up storage
    let document: Document;
    try {
      document = await withTransaction(async (tx) => {
        // Create first version
        await documentVersionRepository.create(
          {
            id: uuidv4(),
            documentId: docId,
            version: 1,
            fileName: file.originalname,
            mimeType: resolvedMimeType,
            fileSize: file.size,
            fileExtension,
            documentType,
            storageKey,
            textContent,
            source: 'upload',
            createdBy: userId,
          },
          tx
        );

        // Create document with cached fields
        const doc = await documentRepository.create(
          {
            id: docId,
            userId,
            knowledgeBaseId,
            title,
            description: options?.description ?? null,
            currentVersion: 1,
            fileName: file.originalname,
            mimeType: resolvedMimeType,
            fileSize: file.size,
            fileExtension,
            documentType,
            processingStatus: 'pending',
            createdBy: userId,
          },
          tx
        );

        // Increment knowledge base document count
        await knowledgeBaseService.incrementDocumentCount(knowledgeBaseId, 1, tx);

        return doc;
      });
    } catch (err) {
      // Transaction failed - clean up uploaded file
      logger.warn({ storageKey, err }, 'Upload transaction failed, cleaning up storage');
      try {
        await documentStorageService.deleteDocument(storageKey);
      } catch (cleanupErr) {
        logger.error({ storageKey, cleanupErr }, 'Failed to clean up storage after upload failure');
      }
      throw err;
    }

    // Log operation
    logOperation({
      userId,
      resourceType: 'document',
      resourceId: docId,
      resourceName: title,
      action: 'document.upload',
      description: `Uploaded document: ${file.originalname}`,
      metadata: {
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: resolvedMimeType,
        documentType,
        knowledgeBaseId,
      },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });

    // Trigger async document processing for RAG
    processingService.processDocument(docId, userId).catch((err) => {
      logger.warn({ documentId: docId, err }, 'Failed to trigger document processing');
    });

    return toDocumentInfo(document);
  },
};
