import express from 'express';
import { storageController } from './storage.controller';

const router = express.Router();

// Serve files with signature verification
// Express 5 uses path-to-regexp v8 which requires named wildcards: {*name}
// This matches: /files/documents/user123/file.pdf
router.get('/files/{*key}', storageController.serveFile);

export const storageRoutes = router;
