export * from './api';
export * from './auth';
export * from './email';
export * from './document';
export * from './knowledge-base';

// Unified error code type
import type { AuthErrorCode } from './auth';
import type { EmailErrorCode } from './email';
import type { DocumentErrorCode } from './document';
import type { KnowledgeBaseErrorCode } from './knowledge-base';
export type AppErrorCode =
  | AuthErrorCode
  | EmailErrorCode
  | DocumentErrorCode
  | KnowledgeBaseErrorCode;
