import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import type { SignedUrlOptions, StorageProvider } from '../storage.types';
import { env } from '@config/env';
import { generateSignedUrl } from '@shared/utils';
import { Errors } from '@shared/errors';

export class LocalStorageProvider implements StorageProvider {
  private basePath: string;

  constructor() {
    this.basePath = path.resolve(env.LOCAL_STORAGE_PATH);
  }

  /**
   * Resolve key to an absolute path and ensure it stays within basePath.
   * Prevents directory traversal attacks (e.g. key = "../../etc/passwd").
   */
  private resolveSafePath(key: string): string {
    // Normalize and resolve to absolute path
    const resolved = path.resolve(this.basePath, key);

    // Ensure the resolved path is within basePath (with separator to avoid prefix false-positives)
    if (!resolved.startsWith(this.basePath + path.sep) && resolved !== this.basePath) {
      throw Errors.validation('Invalid file key: path traversal detected');
    }

    return resolved;
  }

  // contentType is not stored with local files; it's inferred from extension on read
  async upload(key: string, buffer: Buffer): Promise<void> {
    const filePath = this.resolveSafePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolveSafePath(key);
    try {
      await fs.unlink(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async getStream(key: string): Promise<{
    body: AsyncIterable<Uint8Array>;
    contentType: string | undefined;
    contentLength: number | undefined;
  }> {
    const filePath = this.resolveSafePath(key);
    const stat = await fs.stat(filePath);
    const stream = createReadStream(filePath);

    // Infer content type from extension
    const ext = path.extname(key).toLowerCase();
    const contentType = EXTENSION_CONTENT_TYPES[ext];

    return {
      body: Readable.toWeb(stream) as unknown as AsyncIterable<Uint8Array>,
      contentType,
      contentLength: stat.size,
    };
  }

  async getBuffer(key: string): Promise<Buffer> {
    const filePath = this.resolveSafePath(key);
    return fs.readFile(filePath);
  }

  getPublicUrl(key: string, options?: SignedUrlOptions): string {
    // In development with signing disabled, use direct static path (for debugging)
    if (env.NODE_ENV === 'development' && env.DISABLE_FILE_SIGNING) {
      return `${env.FRONTEND_URL}/api/uploads/${key}`;
    }
    // Use signed URL for secure access
    return `${env.FRONTEND_URL}${generateSignedUrl({ key, expiresIn: options?.expiresIn })}`;
  }
}

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};
