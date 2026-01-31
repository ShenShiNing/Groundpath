import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import type { StorageProvider } from '../storage.types';
import { env } from '@config/env';

export class LocalStorageProvider implements StorageProvider {
  private basePath: string;

  constructor() {
    this.basePath = path.resolve(env.LOCAL_STORAGE_PATH);
  }

  // contentType is not stored with local files; it's inferred from extension on read
  async upload(key: string, buffer: Buffer): Promise<void> {
    const filePath = path.join(this.basePath, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.basePath, key);
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
    const filePath = path.join(this.basePath, key);
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
    const filePath = path.join(this.basePath, key);
    return fs.readFile(filePath);
  }

  getPublicUrl(key: string): string {
    return `${env.FRONTEND_URL}/api/uploads/${key}`;
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
