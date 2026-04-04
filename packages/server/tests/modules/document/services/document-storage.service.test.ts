import { beforeEach, describe, expect, it, vi } from 'vitest';

const { uploadMock, getPublicUrlMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  getPublicUrlMock: vi.fn((key: string) => `https://storage.example.com/${key}`),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'generated-uuid-123'),
}));

vi.mock('@config/env', () => ({
  documentConfig: {
    maxSize: 5 * 1024 * 1024,
    textContentMaxLength: 500000,
    textPreviewMaxLength: 20000,
  },
  storageConfig: {
    signing: {
      avatarUrlExpiresIn: 3600,
    },
    r2: {
      publicUrl: 'https://storage.example.com',
    },
  },
}));

vi.mock('@modules/storage/public/provider', () => ({
  storageProvider: {
    upload: uploadMock,
    delete: vi.fn(),
    getPublicUrl: getPublicUrlMock,
    getStream: vi.fn(),
    getBuffer: vi.fn(),
  },
}));

vi.mock('@core/logger', () => ({
  createLogger: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('pdf-parse', () => ({
  PDFParse: vi.fn(),
}));

vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn(),
  },
}));

import { documentStorageService } from '@modules/document/public/storage';

function createPdfBuffer(): Buffer {
  return Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj', 'ascii');
}

function createDocxLikeBuffer(): Buffer {
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('[Content_Types].xml\0_rels/.rels\0word/document.xml', 'latin1'),
  ]);
}

describe('documentStorageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject a fake PDF whose content does not match the declared signature', () => {
    const result = documentStorageService.validateFile({
      buffer: Buffer.from('this is not really a pdf'),
      mimetype: 'application/pdf',
      originalname: 'invoice.pdf',
      size: 24,
    });

    expect(result).toEqual({
      valid: false,
      error: 'File content does not match the declared PDF format',
    });
  });

  it('should trust a valid PDF signature over a misleading text MIME type', async () => {
    const file = {
      buffer: createPdfBuffer(),
      mimetype: 'text/plain',
      originalname: 'report.pdf',
      size: 46,
    };

    expect(documentStorageService.validateFile(file)).toEqual({ valid: true });

    const uploaded = await documentStorageService.uploadDocument('user-123', file);

    expect(uploadMock).toHaveBeenCalledWith(
      'documents/user-123/generated-uuid-123.pdf',
      file.buffer,
      'application/pdf'
    );
    expect(uploaded).toMatchObject({
      fileExtension: 'pdf',
      documentType: 'pdf',
      resolvedMimeType: 'application/pdf',
    });
  });

  it('should reject a generic zip renamed as docx when required docx entries are missing', () => {
    const result = documentStorageService.validateFile({
      buffer: Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        Buffer.from('plain/readme.txt', 'latin1'),
      ]),
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      originalname: 'draft.docx',
      size: 20,
    });

    expect(result).toEqual({
      valid: false,
      error: 'File content does not match the declared DOCX format',
    });
  });

  it('should accept docx uploads by extension when the container signature matches', async () => {
    const file = {
      buffer: createDocxLikeBuffer(),
      mimetype: 'application/octet-stream',
      originalname: 'draft.docx',
      size: 56,
    };

    expect(documentStorageService.validateFile(file)).toEqual({ valid: true });

    const uploaded = await documentStorageService.uploadDocument('user-123', file);

    expect(uploadMock).toHaveBeenCalledWith(
      'documents/user-123/generated-uuid-123.docx',
      file.buffer,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(uploaded).toMatchObject({
      fileExtension: 'docx',
      documentType: 'docx',
      resolvedMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  });

  it('should reject binary content disguised as markdown', () => {
    const result = documentStorageService.validateFile({
      buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]),
      mimetype: 'text/plain',
      originalname: 'notes.md',
      size: 6,
    });

    expect(result).toEqual({
      valid: false,
      error: 'File content does not look like a text document',
    });
  });
});
