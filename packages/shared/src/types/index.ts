export * from './api';
export * from './auth';
export * from './email';
export * from './document';
export * from './knowledge-base';
export * from './llm';
export * from './chat';
export * from './document-ai';

// Unified error code type
import type { AuthErrorCode } from './auth';
import type { EmailErrorCode } from './email';
import type { DocumentErrorCode } from './document';
import type { KnowledgeBaseErrorCode } from './knowledge-base';
import type { LLMErrorCode } from './llm';
import type { ChatErrorCode } from './chat';
import type { DocumentAIErrorCode } from './document-ai';
export type AppErrorCode =
  | AuthErrorCode
  | EmailErrorCode
  | DocumentErrorCode
  | KnowledgeBaseErrorCode
  | LLMErrorCode
  | ChatErrorCode
  | DocumentAIErrorCode;
