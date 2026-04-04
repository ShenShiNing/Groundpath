import type { DocumentType } from '@groundpath/shared/types';

export type SupportedDocumentType = Exclude<DocumentType, 'other'>;

const ALLOWED_MIME_TYPES: Record<string, SupportedDocumentType> = {
  'application/pdf': 'pdf',
  'text/markdown': 'markdown',
  'text/x-markdown': 'markdown',
  'text/plain': 'text',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

const EXTENSION_TO_DOCTYPE: Record<string, SupportedDocumentType> = {
  pdf: 'pdf',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  docx: 'docx',
};

const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const PREFERRED_MIME_BY_DOCUMENT_TYPE: Record<SupportedDocumentType, string> = {
  pdf: 'application/pdf',
  markdown: 'text/markdown',
  text: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const PDF_MAGIC_HEADER = Buffer.from('%PDF-', 'ascii');
const ZIP_LOCAL_FILE_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const DOCX_REQUIRED_ENTRIES = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'];

export interface ResolvedDocumentDescriptor {
  fileExtension: string;
  documentType: SupportedDocumentType;
  resolvedMimeType: string;
}

export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? (parts.pop() ?? '').toLowerCase() : '';
}

export function isAllowedDocumentMimeType(mimeType: string): boolean {
  return mimeType in ALLOWED_MIME_TYPES;
}

export function isAllowedDocumentExtension(extension: string): boolean {
  return extension.toLowerCase() in EXTENSION_TO_DOCTYPE;
}

export function getDocumentTypeFromMimeType(mimeType: string): DocumentType {
  return ALLOWED_MIME_TYPES[mimeType] ?? 'other';
}

export function getDocumentTypeFromExtension(extension: string): DocumentType {
  return EXTENSION_TO_DOCTYPE[extension.toLowerCase()] ?? 'other';
}

export function getMimeTypeFromExtension(extension: string): string | undefined {
  return EXTENSION_TO_MIME[extension.toLowerCase()];
}

export function getAllowedDocumentMimeTypes(): string[] {
  return Object.keys(ALLOWED_MIME_TYPES);
}

export function getAllowedDocumentExtensions(): string[] {
  return Object.keys(EXTENSION_TO_DOCTYPE);
}

function resolveDeclaredDocumentType(
  mimeType: string,
  extension: string
): SupportedDocumentType | null {
  const byExtension = EXTENSION_TO_DOCTYPE[extension.toLowerCase()];
  if (byExtension) {
    return byExtension;
  }

  return ALLOWED_MIME_TYPES[mimeType] ?? null;
}

function resolveMimeType(
  documentType: SupportedDocumentType,
  extension: string,
  fallbackMimeType: string
): string {
  return (
    EXTENSION_TO_MIME[extension.toLowerCase()] ??
    PREFERRED_MIME_BY_DOCUMENT_TYPE[documentType] ??
    fallbackMimeType
  );
}

export function resolveDocumentDescriptor(file: {
  mimetype: string;
  originalname?: string;
}): ResolvedDocumentDescriptor | null {
  const fileExtension = file.originalname ? getFileExtension(file.originalname) : '';
  const documentType = resolveDeclaredDocumentType(file.mimetype, fileExtension);

  if (!documentType) {
    return null;
  }

  return {
    fileExtension,
    documentType,
    resolvedMimeType: resolveMimeType(documentType, fileExtension, file.mimetype),
  };
}

function hasPdfMagicNumber(buffer: Buffer): boolean {
  const maxOffset = Math.min(Math.max(buffer.length - PDF_MAGIC_HEADER.length, 0), 1024);

  for (let offset = 0; offset <= maxOffset; offset++) {
    if (buffer.subarray(offset, offset + PDF_MAGIC_HEADER.length).equals(PDF_MAGIC_HEADER)) {
      return true;
    }
  }

  return false;
}

function hasDocxContainerSignature(buffer: Buffer): boolean {
  if (
    buffer.length < ZIP_LOCAL_FILE_HEADER.length ||
    !buffer.subarray(0, ZIP_LOCAL_FILE_HEADER.length).equals(ZIP_LOCAL_FILE_HEADER)
  ) {
    return false;
  }

  const archiveView = buffer.toString('latin1');
  return DOCX_REQUIRED_ENTRIES.every((entry) => archiveView.includes(entry));
}

function isLikelyTextContent(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return true;
  }

  if (buffer.includes(0)) {
    return false;
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let suspiciousBytes = 0;

  for (const byte of sample) {
    const isAllowedControl = byte === 0x09 || byte === 0x0a || byte === 0x0d;
    const isPrintableAscii = byte >= 0x20 && byte <= 0x7e;
    const isNonAsciiTextByte = byte >= 0x80;

    if (!isAllowedControl && !isPrintableAscii && !isNonAsciiTextByte) {
      suspiciousBytes++;
    }
  }

  return suspiciousBytes / sample.length <= 0.1;
}

export function matchesDocumentSignature(
  buffer: Buffer,
  documentType: SupportedDocumentType
): boolean {
  switch (documentType) {
    case 'pdf':
      return hasPdfMagicNumber(buffer);
    case 'docx':
      return hasDocxContainerSignature(buffer);
    case 'markdown':
    case 'text':
      return isLikelyTextContent(buffer);
    default:
      return false;
  }
}

export function getSignatureMismatchError(documentType: SupportedDocumentType): string {
  switch (documentType) {
    case 'pdf':
      return 'File content does not match the declared PDF format';
    case 'docx':
      return 'File content does not match the declared DOCX format';
    case 'markdown':
    case 'text':
      return 'File content does not look like a text document';
    default:
      return 'File content does not match the declared file type';
  }
}
