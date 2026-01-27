import type { Request, Response } from 'express';
import express from 'express';
import authRoutes from './authRoutes';

const router = express.Router();

// Health check
router.get('/api/hello', (req: Request, res: Response) => {
  res.json({ message: 'Hello World!' });
});

// Auth routes
router.use('/api/auth', authRoutes);

export default router;
