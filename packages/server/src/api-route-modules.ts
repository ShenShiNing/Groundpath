import type { Router } from 'express';
import { authRoutes, emailRoutes, oauthRoutes } from './modules/auth';
import { chatRoutes } from './modules/chat';
import { documentAiRoutes } from './modules/document-ai';
import documentRoutes from './modules/document/document.routes';
import knowledgeBaseRoutes from './modules/knowledge-base/knowledge-base.routes';
import { llmRoutes } from './modules/llm';
import logsRoutes from './modules/logs/logs.routes';
import ragRoutes from './modules/rag/rag.routes';
import { storageRoutes } from './modules/storage';
import { userRoutes } from './modules/user';

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

export const apiRouteModules: ApiRouteModuleMount[] = [
  { id: 'storage', basePath: '/api', router: storageRoutes },
  { id: 'auth', basePath: '/api/auth', router: authRoutes },
  { id: 'email', basePath: '/api/auth/email', router: emailRoutes },
  { id: 'oauth', basePath: '/api/auth/oauth', router: oauthRoutes },
  { id: 'user', basePath: '/api/user', router: userRoutes },
  { id: 'document', basePath: '/api/documents', router: documentRoutes },
  { id: 'knowledge-base', basePath: '/api/knowledge-bases', router: knowledgeBaseRoutes },
  { id: 'logs', basePath: '/api/logs', router: logsRoutes },
  { id: 'rag', basePath: '/api/rag', router: ragRoutes },
  { id: 'llm', basePath: '/api/llm', router: llmRoutes },
  { id: 'chat', basePath: '/api/chat', router: chatRoutes },
  { id: 'document-ai', basePath: '/api/document-ai', router: documentAiRoutes },
];
