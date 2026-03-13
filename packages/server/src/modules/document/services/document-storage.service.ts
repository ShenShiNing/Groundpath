import { v4 as uuidv4 } from 'uuid';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import type { DocumentType } from '@knowledge-agent/shared/types';
import { documentConfig, storageConfig } from '@config/env';
import { createLogger } from '@core/logger';
import { storageProvider } from '../../storage';

const logger = createLogger('document-storage');

/**
 * Allowed document MIME types
 */
const ALLOWED_MIME_TYPES: Record<string, DocumentType> = {
  'application/pdf': 'pdf',
  'text/markdown': 'markdown',
  'text/x-markdown': 'markdown',
  'text/plain': 'text',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

/**
 * Extension to DocumentType mapping (fallback when MIME type is unreliable)
 */
const EXTENSION_TO_DOCTYPE: Record<string, DocumentType> = {
  pdf: 'pdf',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  docx: 'docx',
};

/**
 * Extension to preferred MIME type mapping
 */
const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/**
 * Get max file size from config (default 21 MiB)
 */
function getMaxFileSize(): number {
  return documentConfig.maxSize;
}

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? (parts.pop() ?? '').toLowerCase() : '';
}

/**
 * Document storage service
 */
export const documentStorageService = {
  /**
   * Check if a MIME type is allowed
   */
  isAllowedMimeType(mimeType: string): boolean {
    return mimeType in ALLOWED_MIME_TYPES;
  },

  /**
   * Check if a file extension is allowed
   */
  isAllowedExtension(extension: string): boolean {
    return extension.toLowerCase() in EXTENSION_TO_DOCTYPE;
  },

  /**
   * Get document type from MIME type
   */
  getDocumentType(mimeType: string): DocumentType {
    return ALLOWED_MIME_TYPES[mimeType] ?? 'other';
  },

  /**
   * Get document type from file extension
   */
  getDocumentTypeByExtension(extension: string): DocumentType {
    return EXTENSION_TO_DOCTYPE[extension.toLowerCase()] ?? 'other';
  },

  /**
   * Get preferred MIME type from file extension
   */
  getMimeTypeByExtension(extension: string): string | undefined {
    return EXTENSION_TO_MIME[extension.toLowerCase()];
  },

  /**
   * Get list of allowed MIME types
   */
  getAllowedMimeTypes(): string[] {
    return Object.keys(ALLOWED_MIME_TYPES);
  },

  /**
   * Get list of allowed extensions
   */
  getAllowedExtensions(): string[] {
    return Object.keys(EXTENSION_TO_DOCTYPE);
  },

  /**
   * Validate file before upload (checks both MIME type and extension)
   */
  validateFile(file: { mimetype: string; size: number; originalname?: string }): {
    valid: boolean;
    error?: string;
  } {
    const ext = file.originalname ? getFileExtension(file.originalname) : '';

    // Check MIME type first, then fallback to extension
    const isMimeAllowed = this.isAllowedMimeType(file.mimetype);
    const isExtAllowed = ext ? this.isAllowedExtension(ext) : false;

    if (!isMimeAllowed && !isExtAllowed) {
      const allowedExts = this.getAllowedExtensions().join(', ');
      return { valid: false, error: `Invalid file type. Allowed extensions: ${allowedExts}` };
    }

    const maxSize = getMaxFileSize();
    if (file.size > maxSize) {
      const maxMB = Math.round(maxSize / (1024 * 1024));
      return { valid: false, error: `File too large. Maximum size is ${maxMB}MB` };
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
    const ext = getFileExtension(file.originalname);

    // Determine document type: prefer MIME type, fallback to extension
    let documentType: DocumentType;
    let resolvedMimeType: string;

    if (this.isAllowedMimeType(file.mimetype)) {
      documentType = this.getDocumentType(file.mimetype);
      resolvedMimeType = file.mimetype;
    } else if (ext && this.isAllowedExtension(ext)) {
      // Fallback: use extension to determine type
      documentType = this.getDocumentTypeByExtension(ext);
      resolvedMimeType = this.getMimeTypeByExtension(ext) ?? file.mimetype;
    } else {
      documentType = 'other';
      resolvedMimeType = file.mimetype;
    }

    const key = `documents/${userId}/${uuidv4()}.${ext || 'bin'}`;

    await storageProvider.upload(key, file.buffer, resolvedMimeType);

    return {
      storageKey: key,
      storageUrl: storageProvider.getPublicUrl(key),
      fileExtension: ext,
      documentType,
      resolvedMimeType,
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
