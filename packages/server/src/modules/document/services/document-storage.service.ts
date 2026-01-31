import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import type { DocumentType } from '@knowledge-agent/shared/types';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? '';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? '';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

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
 * Get max file size from environment (default 20MB)
 */
function getMaxFileSize(): number {
  const envValue = process.env.MAX_DOCUMENT_SIZE;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 21 * 1024 * 1024; // 21 MiB default (allows files that Windows shows as ~20MB)
}

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? (parts.pop() ?? '').toLowerCase() : '';
}

/**
 * Document storage service for Cloudflare R2
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
   * Upload document to R2
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

    await s3Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: resolvedMimeType,
      })
    );

    return {
      storageKey: key,
      storageUrl: `${R2_PUBLIC_URL}/${key}`,
      fileExtension: ext,
      documentType,
      resolvedMimeType,
    };
  },

  /**
   * Delete document from R2 by storage key
   */
  async deleteDocument(storageKey: string): Promise<void> {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: storageKey,
      })
    );
  },

  /**
   * Get document stream for proxied download
   */
  async getDocumentStream(storageKey: string): Promise<{
    body: AsyncIterable<Uint8Array>;
    contentType: string | undefined;
    contentLength: number | undefined;
  }> {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: storageKey,
      })
    );

    if (!response.Body) {
      throw new Error('No content returned from storage');
    }

    return {
      body: response.Body as AsyncIterable<Uint8Array>,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  },

  /**
   * Get document content as buffer (for text extraction)
   */
  async getDocumentContent(storageKey: string): Promise<Buffer> {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: storageKey,
      })
    );

    const stream = response.Body;
    if (!stream) {
      throw new Error('No content returned from storage');
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  },

  /**
   * Extract text content from document for preview and search
   * Supports: markdown, text, pdf, docx
   */
  async extractTextContent(
    storageKey: string,
    documentType: DocumentType,
    maxLength: number = 50000
  ): Promise<string | null> {
    // Skip extraction for unsupported types
    if (!['markdown', 'text', 'pdf', 'docx'].includes(documentType)) {
      return null;
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
            console.error('PDF parsing error:', pdfError);
            return null;
          }
          break;

        case 'docx':
          try {
            const docxResult = await mammoth.extractRawText({ buffer });
            text = docxResult.value || '';
          } catch (docxError) {
            console.error('DOCX parsing error:', docxError);
            return null;
          }
          break;

        default:
          return null;
      }

      // Normalize whitespace
      text = text.replace(/\s+/g, ' ').trim();

      return text.length > maxLength ? text.substring(0, maxLength) : text;
    } catch (error) {
      console.error('Text extraction error:', error);
      return null;
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
 * Storage service for avatar and image uploads to Cloudflare R2
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
   * Upload avatar image to R2
   */
  async uploadAvatar(
    userId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string }
  ): Promise<string> {
    const ext = file.originalname.split('.').pop() ?? 'jpg';
    const key = `avatars/${userId}/${uuidv4()}.${ext}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
    );

    return `${R2_PUBLIC_URL}/${key}`;
  },

  /**
   * Delete file from R2 by URL
   */
  async deleteByUrl(url: string): Promise<void> {
    if (!url.startsWith(R2_PUBLIC_URL)) return;

    const key = url.replace(`${R2_PUBLIC_URL}/`, '');
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      })
    );
  },
};
