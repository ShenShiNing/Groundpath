import express from 'express';
import multer from 'multer';
import { authenticate } from '@shared/middleware/auth.middleware';
import { userController } from './controllers/user.controller';
// Direct import to avoid circular dependency through barrels
import { uploadController } from '@modules/document/controllers/upload.controller';

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
