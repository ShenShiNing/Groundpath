import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? '';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? '';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Allowed image MIME types
 */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * Max file size in bytes (2MB)
 */
const MAX_FILE_SIZE = 2 * 1024 * 1024;

/**
 * Storage service for Cloudflare R2
 */
export const storageService = {
  /**
   * Validate file before upload
   */
  validateFile(file: { mimetype: string; size: number }): { valid: boolean; error?: string } {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return { valid: false, error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP' };
    }
    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: 'File too large. Maximum size is 2MB' };
    }
    return { valid: true };
  },

  /**
   * Upload avatar image to R2
   */
  async uploadAvatar(
    userId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string }
  ): Promise<string> {
    const ext = file.originalname.split('.').pop() ?? 'jpg';
    const key = `avatars/${userId}/${uuidv4()}.${ext}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
    );

    return `${R2_PUBLIC_URL}/${key}`;
  },

  /**
   * Delete file from R2 by URL
   */
  async deleteByUrl(url: string): Promise<void> {
    if (!url.startsWith(R2_PUBLIC_URL)) return;

    const key = url.replace(`${R2_PUBLIC_URL}/`, '');
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      })
    );
  },
};
