import express from 'express';
import { folderController } from './controllers/folder.controller';
import { authenticate } from '@shared/middleware/authMiddleware';
import { validateBody } from '@shared/middleware/validationMiddleware';
import {
  createFolderRequestSchema,
  updateFolderRequestSchema,
} from '@knowledge-agent/shared/schemas';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ==================== Folder Routes ====================

// Create folder
router.post('/', validateBody(createFolderRequestSchema), folderController.create);

// List folders
router.get('/', folderController.list);

// Get folder details
router.get('/:id', folderController.getById);

// Get child folders
router.get('/:id/children', folderController.getChildren);

// Update folder
router.patch('/:id', validateBody(updateFolderRequestSchema), folderController.update);

// Delete folder
router.delete('/:id', folderController.delete);

export default router;
