export * from './api';
export * from './auth';
export * from './email';
export * from './document';

// Unified error code type
import type { AuthErrorCode } from './auth';
import type { EmailErrorCode } from './email';
import type { DocumentErrorCode } from './document';
export type AppErrorCode = AuthErrorCode | EmailErrorCode | DocumentErrorCode;
