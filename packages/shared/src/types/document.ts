import { DOCUMENT_ERROR_CODES } from '../constants';

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
  folderId: string | null;
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
  folderId: string | null;
  processingStatus: ProcessingStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Trash document list item (includes deletedAt) */
export interface TrashDocumentListItem extends DocumentListItem {
  deletedAt: Date;
}

/** Document with folder info */
export interface DocumentWithFolder extends DocumentInfo {
  folder: FolderInfo | null;
}

// ==================== Folder Interfaces ====================

/** Folder info returned from API */
export interface FolderInfo {
  id: string;
  userId: string;
  parentId: string | null;
  name: string;
  path: string;
  knowledgeBaseId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Folder with children count */
export interface FolderWithCounts extends FolderInfo {
  documentCount: number;
  childFolderCount: number;
}

/** Folder tree node for navigation */
export interface FolderTreeNode extends FolderInfo {
  children: FolderTreeNode[];
}

// ==================== Request Types ====================

export type {
  CreateFolderRequest,
  UpdateFolderRequest,
  UpdateDocumentRequest,
  SaveDocumentContentRequest,
  DocumentListParams,
  TrashListParams,
} from '../schemas/document';

// ==================== Response Types ====================

/** Paginated document list response */
export interface DocumentListResponse {
  documents: DocumentListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/** Upload document response */
export interface UploadDocumentResponse {
  document: DocumentInfo;
  message: string;
}

/** Trash document list response */
export interface TrashListResponse {
  documents: TrashDocumentListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
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
