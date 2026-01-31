import express from 'express';
import multer from 'multer';
import { authenticate } from '@shared/middleware/authMiddleware';
import { userController } from './controllers/user.controller';
import { uploadController } from '../document';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
});

// Profile management
router.patch('/profile', authenticate, userController.updateProfile);

// Avatar upload
router.post('/avatar', authenticate, upload.single('avatar'), uploadController.uploadAvatar);

export default router;
