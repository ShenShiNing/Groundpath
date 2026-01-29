import type { Request, Response } from 'express';
import express from 'express';
import authRoutes from './authRoutes';
import emailRoutes from './emailRoutes';
import userRoutes from './userRoutes';

const router = express.Router();

// Health check
router.get('/api/hello', (req: Request, res: Response) => {
  res.json({ message: 'Hello World!' });
});

// Auth routes
router.use('/api/auth', authRoutes);

// Email verification routes (under /api/auth/email)
router.use('/api/auth/email', emailRoutes);

// User routes
router.use('/api/user', userRoutes);

export default router;
