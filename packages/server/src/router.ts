import path from 'path';
import type { Request, Response } from 'express';
import express from 'express';
import { authRoutes, emailRoutes, oauthRoutes } from './modules/auth';
import { userRoutes } from './modules/user';
import { documentRoutes, folderRoutes } from './modules/document';
import { knowledgeBaseRoutes } from './modules/knowledge-base';
import { logsRoutes } from './modules/logs';
import { ragRoutes } from './modules/rag';
import { env } from '@config/env';

const router = express.Router();

// Serve local uploads when using local storage
const storageType = env.STORAGE_TYPE || (env.NODE_ENV === 'production' ? 'r2' : 'local');
if (storageType === 'local') {
  router.use('/api/uploads', express.static(path.resolve(env.LOCAL_STORAGE_PATH)));
}

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

export default router;
