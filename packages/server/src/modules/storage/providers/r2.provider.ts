import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import type { SignedUrlOptions, StorageProvider } from '../storage.types';
import { externalServiceConfig, storageConfig } from '@config/env';
import { Errors } from '@core/errors';
import { executeExternalCall } from '@core/utils/external-call';

export class R2StorageProvider implements StorageProvider {
  private client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${storageConfig.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: storageConfig.r2.accessKeyId,
        secretAccessKey: storageConfig.r2.secretAccessKey,
      },
    });
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<void> {
    await executeExternalCall({
      service: 'storage',
      operation: 'r2.upload',
      policy: externalServiceConfig.storage,
      execute: (signal) =>
        this.client.send(
          new PutObjectCommand({
            Bucket: storageConfig.r2.bucketName,
            Key: key,
            Body: buffer,
            ContentType: contentType,
          }),
          { abortSignal: signal }
        ),
    });
  }

  async delete(key: string): Promise<void> {
    await executeExternalCall({
      service: 'storage',
      operation: 'r2.delete',
      policy: externalServiceConfig.storage,
      execute: (signal) =>
        this.client.send(
          new DeleteObjectCommand({
            Bucket: storageConfig.r2.bucketName,
            Key: key,
          }),
          { abortSignal: signal }
        ),
    });
  }

  async getStream(key: string): Promise<{
    body: AsyncIterable<Uint8Array>;
    contentType: string | undefined;
    contentLength: number | undefined;
  }> {
    const response = await executeExternalCall({
      service: 'storage',
      operation: 'r2.getStream',
      policy: externalServiceConfig.storage,
      execute: (signal) =>
        this.client.send(
          new GetObjectCommand({
            Bucket: storageConfig.r2.bucketName,
            Key: key,
          }),
          { abortSignal: signal }
        ),
    });

    if (!response.Body) {
      throw Errors.external('No content returned from storage');
    }

    return {
      body: response.Body as AsyncIterable<Uint8Array>,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  }

  async getBuffer(key: string): Promise<Buffer> {
    const response = await executeExternalCall({
      service: 'storage',
      operation: 'r2.getBuffer',
      policy: externalServiceConfig.storage,
      execute: (signal) =>
        this.client.send(
          new GetObjectCommand({
            Bucket: storageConfig.r2.bucketName,
            Key: key,
          }),
          { abortSignal: signal }
        ),
    });

    const stream = response.Body;
    if (!stream) {
      throw Errors.external('No content returned from storage');
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  // R2 uses public bucket URL, no signing needed (handled by Cloudflare)

  getPublicUrl(key: string, _options?: SignedUrlOptions): string {
    return `${storageConfig.r2.publicUrl}/${key}`;
  }
}
