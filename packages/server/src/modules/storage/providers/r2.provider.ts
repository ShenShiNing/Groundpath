import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import type { SignedUrlOptions, StorageProvider } from '../storage.types';
import { env } from '@config/env';

export class R2StorageProvider implements StorageProvider {
  private client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
      })
    );
  }

  async getStream(key: string): Promise<{
    body: AsyncIterable<Uint8Array>;
    contentType: string | undefined;
    contentLength: number | undefined;
  }> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
      })
    );

    if (!response.Body) {
      throw new Error('No content returned from storage');
    }

    return {
      body: response.Body as AsyncIterable<Uint8Array>,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  }

  async getBuffer(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
      })
    );

    const stream = response.Body;
    if (!stream) {
      throw new Error('No content returned from storage');
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  // R2 uses public bucket URL, no signing needed (handled by Cloudflare)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getPublicUrl(key: string, _options?: SignedUrlOptions): string {
    return `${env.R2_PUBLIC_URL}/${key}`;
  }
}
