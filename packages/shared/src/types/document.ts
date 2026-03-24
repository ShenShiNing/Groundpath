import { DOCUMENT_ERROR_CODES } from '../constants';
import type { CursorPaginationMeta } from './api';

// ==================== Document Types ====================

export const DOCUMENT_TYPES = ['pdf', 'markdown', 'text', 'docx', 'other'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const PROCESSING_STATUS = ['pending', 'processing', 'completed', 'failed'] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUS)[number];

export const VERSION_SOURCE = ['upload', 'edit', 'ai_generate', 'restore'] as const;
export type VersionSource = (typeof VERSION_SOURCE)[number];

// ==================== Document Interfaces ====================

/** Document info returned from API */
export interface DocumentInfo {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileExtension: string;
  documentType: DocumentType;
  currentVersion: number;
  processingStatus: ProcessingStatus;
  chunkCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Document list item (subset of DocumentInfo) */
export interface DocumentListItem {
  id: string;
  title: string;
  description: string | null;
  fileName: string;
  fileSize: number;
  fileExtension: string;
  documentType: DocumentType;
  processingStatus: ProcessingStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Trash document list item (includes deletedAt) */
export interface TrashDocumentListItem extends DocumentListItem {
  deletedAt: Date;
}

// ==================== Request Types ====================

export type {
  UpdateDocumentRequest,
  SaveDocumentContentRequest,
  DocumentListParams,
  TrashListParams,
} from '../schemas/document';

// ==================== Response Types ====================

/** Paginated document list response */
export interface DocumentListResponse {
  documents: DocumentListItem[];
  pagination: CursorPaginationMeta;
}

/** Upload document response */
export interface UploadDocumentResponse {
  document: DocumentInfo;
  message: string;
}

/** Trash document list response */
export interface TrashListResponse {
  documents: TrashDocumentListItem[];
  pagination: CursorPaginationMeta;
}

// ==================== Version Interfaces ====================

/** Document version list item */
export interface DocumentVersionListItem {
  id: string;
  version: number;
  fileName: string;
  fileSize: number;
  source: VersionSource;
  changeNote: string | null;
  createdAt: Date;
}

/** Version list response */
export interface VersionListResponse {
  versions: DocumentVersionListItem[];
  currentVersion: number;
}

// ==================== Content Interfaces ====================

export interface DocumentContentResponse {
  id: string;
  title: string;
  fileName: string;
  documentType: DocumentType;
  textContent: string | null;
  currentVersion: number;
  processingStatus: ProcessingStatus;
  isEditable: boolean;
  isTruncated: boolean;
  storageUrl: string | null;
}

// ==================== Chunk Interfaces ====================

/** Document chunk info */
export interface DocumentChunkInfo {
  id: string;
  documentId: string;
  version: number;
  chunkIndex: number;
  content: string;
  tokenCount: number | null;
  metadata: {
    pageNumber?: number;
    heading?: string;
    startOffset?: number;
    endOffset?: number;
  } | null;
}

// ==================== Error Types ====================

export type DocumentErrorCode = (typeof DOCUMENT_ERROR_CODES)[keyof typeof DOCUMENT_ERROR_CODES];
