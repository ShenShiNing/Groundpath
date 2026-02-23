import path from 'path';
import type { Request, Response } from 'express';
import express from 'express';
import { authRoutes, emailRoutes, oauthRoutes } from './modules/auth';
import { userRoutes } from './modules/user';
import { documentRoutes, folderRoutes } from './modules/document';
import { knowledgeBaseRoutes } from './modules/knowledge-base';
import { logsRoutes } from './modules/logs';
import { ragRoutes } from './modules/rag';
import { llmRoutes } from './modules/llm';
import { chatRoutes } from './modules/chat';
import { storageRoutes } from './modules/storage';
import { documentAiRoutes } from './modules/document-ai';
import { serverConfig, storageConfig } from '@config/env';

const router = express.Router();

// Serve local uploads when using local storage with signing disabled (dev only)
const storageType = storageConfig.type || (serverConfig.nodeEnv === 'production' ? 'r2' : 'local');
if (
  storageType === 'local' &&
  serverConfig.nodeEnv === 'development' &&
  storageConfig.signing.disabled
) {
  router.use('/api/uploads', express.static(path.resolve(storageConfig.localPath)));
}

// Signed file access route (handles /api/files/*)
router.use('/api', storageRoutes);

// Health check
router.get('/api/hello', (_req: Request, res: Response) => {
  res.json({ message: 'Hello World!' });
});

// Auth routes
router.use('/api/auth', authRoutes);

// Email verification routes (under /api/auth/email)
router.use('/api/auth/email', emailRoutes);

// OAuth routes (under /api/auth/oauth)
router.use('/api/auth/oauth', oauthRoutes);

// User routes
router.use('/api/user', userRoutes);

// Document routes
router.use('/api/documents', documentRoutes);

// Folder routes
router.use('/api/folders', folderRoutes);

// Knowledge base routes
router.use('/api/knowledge-bases', knowledgeBaseRoutes);

// Logs routes
router.use('/api/logs', logsRoutes);

// RAG routes
router.use('/api/rag', ragRoutes);

// LLM configuration routes
router.use('/api/llm', llmRoutes);

// Chat routes
router.use('/api/chat', chatRoutes);

// Document AI routes
router.use('/api/document-ai', documentAiRoutes);

// 404 handler for undefined routes (must be last)
router.use('/api/{*path}', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      requestId: req.requestId,
    },
  });
});

export default router;
