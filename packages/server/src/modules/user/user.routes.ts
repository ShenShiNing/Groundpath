import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { authenticate, validateBody } from '@core/middleware';
import { changeEmailRequestSchema, updateProfileRequestSchema } from '@groundpath/shared/schemas';
import { userController } from './controllers/user.controller';

const router = express.Router();

const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_AVATAR_SIZE,
  },
});

// Multer error handling for avatar uploads
function handleMulterError(err: Error, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const maxMB = Math.round(MAX_AVATAR_SIZE / (1024 * 1024));
      res.status(400).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: `Avatar file too large. Maximum size is ${maxMB}MB`,
        },
      });
      return;
    }
    res.status(400).json({
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: err.message,
      },
    });
    return;
  }
  // Non-multer error, pass to global error handler
  next(err);
}

// Wrapper for upload with error handling
function uploadWithErrorHandling(fieldName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    upload.single(fieldName)(req, res, (err: unknown) => {
      if (err) {
        handleMulterError(err as Error, req, res, next);
      } else {
        next();
      }
    });
  };
}

// Profile management
router.patch(
  '/profile',
  authenticate,
  validateBody(updateProfileRequestSchema),
  userController.updateProfile
);

router.patch(
  '/email',
  authenticate,
  validateBody(changeEmailRequestSchema),
  userController.changeEmail
);

// Avatar upload
router.post(
  '/avatar',
  authenticate,
  uploadWithErrorHandling('avatar'),
  userController.uploadAvatar
);

export default router;
