import type { Router } from 'express';
import authRoutes from './modules/auth/auth.routes';
import emailRoutes from './modules/auth/verification/email.routes';
import oauthRoutes from './modules/auth/oauth/oauth.routes';
import chatRoutes from './modules/chat/chat.routes';
import documentAiRoutes from './modules/document-ai/document-ai.routes';
import documentRoutes from './modules/document/document.routes';
import knowledgeBaseRoutes from './modules/knowledge-base/knowledge-base.routes';
import llmRoutes from './modules/llm/llm.routes';
import logsRoutes from './modules/logs/logs.routes';
import ragRoutes from './modules/rag/rag.routes';
import { storageRoutes } from './modules/storage/storage.routes';
import userRoutes from './modules/user/user.routes';

export type ApiRouteModuleId =
  | 'storage'
  | 'auth'
  | 'email'
  | 'oauth'
  | 'user'
  | 'document'
  | 'knowledge-base'
  | 'logs'
  | 'rag'
  | 'llm'
  | 'chat'
  | 'document-ai';

export interface ApiRouteModuleMount {
  id: ApiRouteModuleId;
  basePath: string;
  router: Router;
}

/**
 * API version prefix for all business routes.
 * Storage/file-serving routes remain unversioned at /api/ because their URLs
 * are persisted in the database (e.g. avatar URLs).
 */
export const API_V1 = '/api/v1';

export const apiRouteModules: ApiRouteModuleMount[] = [
  { id: 'storage', basePath: '/api', router: storageRoutes },
  { id: 'auth', basePath: `${API_V1}/auth`, router: authRoutes },
  { id: 'email', basePath: `${API_V1}/auth/email`, router: emailRoutes },
  { id: 'oauth', basePath: `${API_V1}/auth/oauth`, router: oauthRoutes },
  { id: 'user', basePath: `${API_V1}/users`, router: userRoutes },
  { id: 'document', basePath: `${API_V1}/documents`, router: documentRoutes },
  { id: 'knowledge-base', basePath: `${API_V1}/knowledge-bases`, router: knowledgeBaseRoutes },
  { id: 'logs', basePath: `${API_V1}/logs`, router: logsRoutes },
  { id: 'rag', basePath: `${API_V1}/rag`, router: ragRoutes },
  { id: 'llm', basePath: `${API_V1}/llm`, router: llmRoutes },
  { id: 'chat', basePath: `${API_V1}/chat`, router: chatRoutes },
  { id: 'document-ai', basePath: `${API_V1}/document-ai`, router: documentAiRoutes },
];
