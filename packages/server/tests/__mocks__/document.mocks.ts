import type { Document } from '@shared/db/schema/document/documents.schema';
import type { DocumentVersion } from '@shared/db/schema/document/document-versions.schema';
import type { KnowledgeBase } from '@shared/db/schema/document/knowledge-bases.schema';

// ==================== Shared Test Data ====================

export const mockUserId = 'user-123';
export const mockDocumentId = 'doc-789';
export const mockVersionId = 'version-101';
export const mockKnowledgeBaseId = 'kb-123';

export const mockKnowledgeBase: KnowledgeBase = {
  id: mockKnowledgeBaseId,
  userId: mockUserId,
  name: 'Test Knowledge Base',
  description: 'Test KB description',
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  embeddingDimensions: 1536,
  documentCount: 0,
  totalChunks: 0,
  createdBy: mockUserId,
  createdAt: new Date('2024-01-01'),
  updatedBy: null,
  updatedAt: new Date('2024-01-01'),
  deletedBy: null,
  deletedAt: null,
};

export const mockDocument: Document = {
  id: mockDocumentId,
  userId: mockUserId,
  knowledgeBaseId: mockKnowledgeBaseId,
  title: 'Test Document',
  description: 'Test document description',
  fileName: 'test.pdf',
  mimeType: 'application/pdf',
  fileSize: 1024000,
  fileExtension: 'pdf',
  documentType: 'pdf',
  currentVersion: 1,
  processingStatus: 'completed',
  processingError: null,
  chunkCount: 0,
  createdBy: mockUserId,
  createdAt: new Date('2024-01-01'),
  updatedBy: null,
  updatedAt: new Date('2024-01-01'),
  deletedBy: null,
  deletedAt: null,
};

export const mockDeletedDocument: Document = {
  ...mockDocument,
  id: 'doc-deleted-1',
  title: 'Deleted Document',
  knowledgeBaseId: mockKnowledgeBaseId,
  deletedBy: mockUserId,
  deletedAt: new Date('2024-01-15'),
};

export const mockDocumentVersion: DocumentVersion = {
  id: mockVersionId,
  documentId: mockDocumentId,
  version: 1,
  fileName: 'test_v1.pdf',
  mimeType: 'application/pdf',
  fileSize: 1024000,
  fileExtension: 'pdf',
  documentType: 'pdf',
  storageKey: `documents/${mockUserId}/${mockDocumentId}_v1.pdf`,
  textContent: 'Original text content',
  wordCount: null,
  source: 'upload',
  changeNote: 'Initial version',
  createdBy: mockUserId,
  createdAt: new Date('2024-01-01'),
};

export const mockFile = {
  buffer: Buffer.from('test file content'),
  originalname: 'test.pdf',
  mimetype: 'application/pdf',
  size: 1024,
};

export const mockTextFile = {
  buffer: Buffer.from('Hello, this is plain text content.'),
  originalname: 'readme.txt',
  mimetype: 'text/plain',
  size: 35,
};

export const mockMarkdownFile = {
  buffer: Buffer.from('# Title\n\nThis is markdown content.'),
  originalname: 'notes.md',
  mimetype: 'text/markdown',
  size: 38,
};

export const mockStorageResult = {
  storageKey: `documents/${mockUserId}/generated-uuid-123.pdf`,
  storageUrl: 'https://storage.example.com/documents/generated-uuid-123.pdf',
  fileExtension: 'pdf',
  documentType: 'pdf' as const,
  resolvedMimeType: 'application/pdf',
};

export const mockTextStorageResult = {
  storageKey: `documents/${mockUserId}/generated-uuid-123.txt`,
  storageUrl: 'https://storage.example.com/documents/generated-uuid-123.txt',
  fileExtension: 'txt',
  documentType: 'text' as const,
  resolvedMimeType: 'text/plain',
};

export const mockMarkdownStorageResult = {
  storageKey: `documents/${mockUserId}/generated-uuid-123.md`,
  storageUrl: 'https://storage.example.com/documents/generated-uuid-123.md',
  fileExtension: 'md',
  documentType: 'markdown' as const,
  resolvedMimeType: 'text/markdown',
};

// ==================== 日志辅助函数 ====================

export function logTestInfo(input: unknown, expected: unknown, actual: unknown) {
  console.log(`  测试输入：${JSON.stringify(input)}`);
  console.log(`  预期结果：${JSON.stringify(expected)}`);
  console.log(`  实际结果：${JSON.stringify(actual)}`);
}
