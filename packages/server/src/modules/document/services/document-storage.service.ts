import { v4 as uuidv4 } from 'uuid';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import type { DocumentType } from '@groundpath/shared/types';
import { documentConfig, storageConfig } from '@config/env';
import { createLogger } from '@core/logger';
import { storageProvider } from '@modules/storage/public/provider';
import {
  getAllowedDocumentExtensions,
  getAllowedDocumentMimeTypes,
  getDocumentTypeFromExtension,
  getDocumentTypeFromMimeType,
  getMimeTypeFromExtension,
  getSignatureMismatchError,
  isAllowedDocumentExtension,
  isAllowedDocumentMimeType,
  matchesDocumentSignature,
  resolveDocumentDescriptor,
} from './document-file-validation';

const logger = createLogger('document-storage');

/**
 * Get max file size from config (default 21 MiB)
 */
function getMaxFileSize(): number {
  return documentConfig.maxSize;
}

type FileValidationResult = { valid: true } | { valid: false; error: string };

/**
 * Document storage service
 */
export const documentStorageService = {
  /**
   * Check if a MIME type is allowed
   */
  isAllowedMimeType(mimeType: string): boolean {
    return isAllowedDocumentMimeType(mimeType);
  },

  /**
   * Check if a file extension is allowed
   */
  isAllowedExtension(extension: string): boolean {
    return isAllowedDocumentExtension(extension);
  },

  /**
   * Get document type from MIME type
   */
  getDocumentType(mimeType: string): DocumentType {
    return getDocumentTypeFromMimeType(mimeType);
  },

  /**
   * Get document type from file extension
   */
  getDocumentTypeByExtension(extension: string): DocumentType {
    return getDocumentTypeFromExtension(extension);
  },

  /**
   * Get preferred MIME type from file extension
   */
  getMimeTypeByExtension(extension: string): string | undefined {
    return getMimeTypeFromExtension(extension);
  },

  /**
   * Get list of allowed MIME types
   */
  getAllowedMimeTypes(): string[] {
    return getAllowedDocumentMimeTypes();
  },

  /**
   * Get list of allowed extensions
   */
  getAllowedExtensions(): string[] {
    return getAllowedDocumentExtensions();
  },

  /**
   * Validate file before upload (checks type declaration, size, and file signature)
   */
  validateFile(file: {
    buffer: Buffer;
    mimetype: string;
    size: number;
    originalname?: string;
  }): FileValidationResult {
    const descriptor = resolveDocumentDescriptor({
      mimetype: file.mimetype,
      originalname: file.originalname,
    });
    if (!descriptor) {
      const allowedExts = this.getAllowedExtensions().join(', ');
      return { valid: false, error: `Invalid file type. Allowed extensions: ${allowedExts}` };
    }

    const maxSize = getMaxFileSize();
    if (file.size > maxSize) {
      const maxMB = Math.round(maxSize / (1024 * 1024));
      return { valid: false, error: `File too large. Maximum size is ${maxMB}MB` };
    }

    if (!matchesDocumentSignature(file.buffer, descriptor.documentType)) {
      return { valid: false, error: getSignatureMismatchError(descriptor.documentType) };
    }

    return { valid: true };
  },

  /**
   * Upload document to storage
   */
  async uploadDocument(
    userId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string }
  ): Promise<{
    storageKey: string;
    storageUrl: string;
    fileExtension: string;
    documentType: DocumentType;
    resolvedMimeType: string;
  }> {
    const descriptor = resolveDocumentDescriptor({
      mimetype: file.mimetype,
      originalname: file.originalname,
    });
    if (!descriptor) {
      throw new Error(`Unsupported document type for upload: ${file.originalname}`);
    }

    const key = `documents/${userId}/${uuidv4()}.${descriptor.fileExtension || 'bin'}`;

    await storageProvider.upload(key, file.buffer, descriptor.resolvedMimeType);

    return {
      storageKey: key,
      storageUrl: storageProvider.getPublicUrl(key),
      fileExtension: descriptor.fileExtension,
      documentType: descriptor.documentType,
      resolvedMimeType: descriptor.resolvedMimeType,
    };
  },

  /**
   * Delete document from storage by storage key
   */
  async deleteDocument(storageKey: string): Promise<void> {
    await storageProvider.delete(storageKey);
  },

  /**
   * Get document stream for proxied download
   */
  async getDocumentStream(storageKey: string): Promise<{
    body: AsyncIterable<Uint8Array>;
    contentType: string | undefined;
    contentLength: number | undefined;
  }> {
    return storageProvider.getStream(storageKey);
  },

  /**
   * Get document content as buffer (for text extraction)
   */
  async getDocumentContent(storageKey: string): Promise<Buffer> {
    return storageProvider.getBuffer(storageKey);
  },

  /**
   * Extract text content from document for preview and search
   * Supports: markdown, text, pdf, docx
   * Returns text content and whether it was truncated
   */
  async extractTextContent(
    storageKey: string,
    documentType: DocumentType,
    maxLength?: number
  ): Promise<{ text: string | null; truncated: boolean }> {
    // Skip extraction for unsupported types
    if (!['markdown', 'text', 'pdf', 'docx'].includes(documentType)) {
      return { text: null, truncated: false };
    }

    try {
      const buffer = await this.getDocumentContent(storageKey);
      let text: string;

      switch (documentType) {
        case 'markdown':
        case 'text':
          text = buffer.toString('utf-8');
          break;

        case 'pdf':
          try {
            const pdfParser = new PDFParse({ data: buffer });
            const pdfData = await pdfParser.getText();
            text = pdfData.text || '';
            await pdfParser.destroy();
          } catch (pdfError) {
            logger.error({ err: pdfError }, 'PDF parsing error');
            return { text: null, truncated: false };
          }
          break;

        case 'docx':
          try {
            const docxResult = await mammoth.extractRawText({ buffer });
            text = docxResult.value || '';
          } catch (docxError) {
            logger.error({ err: docxError }, 'DOCX parsing error');
            return { text: null, truncated: false };
          }
          break;

        default:
          return { text: null, truncated: false };
      }

      // Normalize whitespace
      text = text.replace(/\s+/g, ' ').trim();

      // Apply length limit if specified
      if (maxLength && text.length > maxLength) {
        return { text: text.substring(0, maxLength), truncated: true };
      }

      return { text, truncated: false };
    } catch (error) {
      logger.error({ err: error }, 'Text extraction error');
      return { text: null, truncated: false };
    }
  },
};

/**
 * Allowed image MIME types for avatar uploads
 */
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * Max avatar file size in bytes (2MB)
 */
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

/**
 * Storage service for avatar and image uploads
 */
export const storageService = {
  /**
   * Validate image file before upload
   */
  validateFile(file: { mimetype: string; size: number }): { valid: boolean; error?: string } {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      return { valid: false, error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP' };
    }
    if (file.size > MAX_AVATAR_SIZE) {
      return { valid: false, error: 'File too large. Maximum size is 2MB' };
    }
    return { valid: true };
  },

  /**
   * Upload avatar image to storage
   */
  async uploadAvatar(
    userId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string }
  ): Promise<string> {
    const ext = file.originalname.split('.').pop() ?? 'jpg';
    const key = `avatars/${userId}/${uuidv4()}.${ext}`;

    await storageProvider.upload(key, file.buffer, file.mimetype);

    return storageProvider.getPublicUrl(key, {
      expiresIn: storageConfig.signing.avatarUrlExpiresIn,
    });
  },

  /**
   * Delete file from storage by URL
   * Handles both signed URLs (/api/files/) and legacy URLs (/api/uploads/)
   */
  async deleteByUrl(url: string): Promise<void> {
    // Extract key from URL - try both signed and legacy URL patterns
    const match = url.match(/\/api\/(?:uploads|files)\/([^?]+)/);
    if (!match) {
      // Try R2 URL pattern
      const r2PublicUrl = storageConfig.r2.publicUrl;
      if (r2PublicUrl && url.startsWith(r2PublicUrl)) {
        const key = url.replace(r2PublicUrl + '/', '');
        await storageProvider.delete(key);
      }
      return;
    }

    const captured = match[1];
    if (!captured) return;

    let key: string;
    try {
      key = decodeURIComponent(captured);
    } catch {
      return;
    }
    await storageProvider.delete(key);
  },
};
