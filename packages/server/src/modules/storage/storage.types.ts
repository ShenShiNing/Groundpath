export interface StorageProvider {
  upload(key: string, buffer: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  getStream(key: string): Promise<{
    body: AsyncIterable<Uint8Array>;
    contentType: string | undefined;
    contentLength: number | undefined;
  }>;
  getBuffer(key: string): Promise<Buffer>;
  getPublicUrl(key: string): string;
}
