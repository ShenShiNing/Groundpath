import type { Request, Response } from 'express';
import express from 'express';
import { authRoutes, emailRoutes, oauthRoutes } from './modules/auth';
import { userRoutes } from './modules/user';
import { documentRoutes, folderRoutes } from './modules/document';

const router = express.Router();

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

export default router;
