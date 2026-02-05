import type { Request, Response } from 'express';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { asyncHandler } from '@shared/errors/async-handler';
import { Errors } from '@shared/errors';
import { env } from '@config/env';
import { verifySignature } from '@shared/utils';
import { storageProvider } from './storage.factory';
import { createLogger } from '@shared/logger';

const logger = createLogger('storage.controller');

export const storageController = {
  /**
   * GET /api/files/{*key}
   * Serve files with signature verification
   */
  serveFile: asyncHandler(async (req: Request, res: Response) => {
    // Extract key from URL path - Express 5 wildcard params may return string[]
    const rawKey = req.params.key;
    let key: string;
    try {
      key = decodeURIComponent(Array.isArray(rawKey) ? rawKey.join('/') : rawKey || '');
    } catch {
      throw Errors.validation('Invalid file key encoding');
    }

    if (!key) {
      throw Errors.validation('File key is required');
    }

    // Early validation: reject obvious path traversal attempts
    // Note: LocalStorageProvider also validates, but rejecting early avoids unnecessary processing
    if (key.includes('..') || key.startsWith('/') || key.startsWith('\\')) {
      throw Errors.validation('Invalid file key: path traversal detected');
    }

    // In development with signing disabled, skip verification
    const skipVerification = env.NODE_ENV === 'development' && env.DISABLE_FILE_SIGNING;

    if (!skipVerification) {
      const sig = req.query.sig as string | undefined;
      const exp = req.query.exp as string | undefined;

      if (!sig || !exp) {
        throw Errors.auth('INVALID_CREDENTIALS', 'Missing signature or expiration');
      }

      const expNum = parseInt(exp, 10);
      if (isNaN(expNum)) {
        throw Errors.auth('INVALID_CREDENTIALS', 'Invalid expiration format');
      }

      if (!verifySignature(key, sig, expNum)) {
        throw Errors.auth('INVALID_CREDENTIALS', 'Invalid or expired signature');
      }
    }

    // Get file stream from storage
    try {
      const { body, contentType, contentLength } = await storageProvider.getStream(key);

      // Set response headers
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      if (contentLength !== undefined) {
        res.setHeader('Content-Length', contentLength);
      }

      // Set cache headers - signed URLs have expiration built in
      res.setHeader('Cache-Control', 'private, max-age=3600');

      // Convert async iterable to Node.js Readable stream
      const sourceStream = Readable.from(body);

      // Track if client disconnected
      let clientDisconnected = false;
      const onClose = () => {
        clientDisconnected = true;
        sourceStream.destroy();
      };
      res.on('close', onClose);

      try {
        // Use pipeline for proper backpressure handling and cleanup
        await pipeline(sourceStream, res);
      } catch (err) {
        // Ignore errors from client disconnect (expected behavior)
        if (!clientDisconnected && !res.writableEnded) {
          logger.warn({ err, key }, 'Stream error during file serving');
          // Don't throw - response may be partially sent
        }
      } finally {
        res.off('close', onClose);
      }
    } catch (error) {
      // Check if it's a file not found error
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw Errors.notFound('File');
      }
      throw error;
    }
  }),
};
