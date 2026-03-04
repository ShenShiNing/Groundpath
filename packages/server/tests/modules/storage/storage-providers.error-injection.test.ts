import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Mock config and logger ───
vi.mock('@shared/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@config/env', () => ({
  storageConfig: {
    localPath: '/tmp/test-uploads',
    type: 'local',
    signing: { disabled: true },
    r2: {
      accountId: 'test-account',
      accessKeyId: 'test-access',
      secretAccessKey: 'test-secret',
      bucketName: 'test-bucket',
      publicUrl: 'https://cdn.example.com',
    },
  },
  serverConfig: {
    nodeEnv: 'test',
    frontendUrl: 'http://localhost:5173',
  },
}));

// ─── Mock fs/promises for Local Storage ───
const { fsMock } = vi.hoisted(() => ({
  fsMock: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
    stat: vi.fn(),
    readFile: vi.fn(),
  },
}));

vi.mock('fs/promises', () => ({
  default: fsMock,
  ...fsMock,
}));

vi.mock('fs', () => ({
  createReadStream: vi.fn(),
}));

vi.mock('@shared/utils', () => ({
  generateSignedUrl: vi.fn(() => '/api/signed/test'),
}));

vi.mock('@shared/errors', () => ({
  Errors: {
    validation: (msg: string) => new Error(msg),
  },
}));

// ─── Mock S3Client for R2 Storage ───
const { s3SendMock } = vi.hoisted(() => ({
  s3SendMock: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class MockS3 {
    send = s3SendMock;
  },
  PutObjectCommand: class PutObjectCommand {
    constructor(public input: unknown) {}
  },
  DeleteObjectCommand: class DeleteObjectCommand {
    constructor(public input: unknown) {}
  },
  GetObjectCommand: class GetObjectCommand {
    constructor(public input: unknown) {}
  },
}));

import { LocalStorageProvider } from '@modules/storage/providers/local.provider';
import { R2StorageProvider } from '@modules/storage/providers/r2.provider';

// ─── Local Storage Provider Tests ───
describe('Local Storage Error Injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw on path traversal in upload', async () => {
    const provider = new LocalStorageProvider();

    await expect(provider.upload('../../etc/passwd', Buffer.from('hack'))).rejects.toThrow(
      'path traversal'
    );
  });

  it('should throw on path traversal in delete', async () => {
    const provider = new LocalStorageProvider();

    await expect(provider.delete('../../../etc/shadow')).rejects.toThrow('path traversal');
  });

  it('should throw on path traversal in getStream', async () => {
    const provider = new LocalStorageProvider();

    await expect(provider.getStream('../../secret.key')).rejects.toThrow('path traversal');
  });

  it('should throw on path traversal in getBuffer', async () => {
    const provider = new LocalStorageProvider();

    await expect(provider.getBuffer('../../../root/.ssh/id_rsa')).rejects.toThrow('path traversal');
  });

  it('should silently ignore ENOENT on delete', async () => {
    fsMock.unlink.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const provider = new LocalStorageProvider();
    // Should not throw
    await provider.delete('nonexistent.txt');
  });

  it('should throw on EACCES during delete', async () => {
    fsMock.unlink.mockRejectedValue(
      Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    );

    const provider = new LocalStorageProvider();
    await expect(provider.delete('protected.txt')).rejects.toThrow('EACCES');
  });

  it('should throw on write failure during upload', async () => {
    fsMock.mkdir.mockResolvedValue(undefined);
    fsMock.writeFile.mockRejectedValue(
      Object.assign(new Error('ENOSPC: no space left'), { code: 'ENOSPC' })
    );

    const provider = new LocalStorageProvider();
    await expect(provider.upload('test.txt', Buffer.from('content'))).rejects.toThrow('ENOSPC');
  });

  it('should throw on stat failure during getStream', async () => {
    fsMock.stat.mockRejectedValue(
      Object.assign(new Error('ENOENT: file not found'), { code: 'ENOENT' })
    );

    const provider = new LocalStorageProvider();
    await expect(provider.getStream('missing.pdf')).rejects.toThrow('ENOENT');
  });

  it('should throw on read failure during getBuffer', async () => {
    fsMock.readFile.mockRejectedValue(
      Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' })
    );

    const provider = new LocalStorageProvider();
    await expect(provider.getBuffer('missing.txt')).rejects.toThrow('ENOENT');
  });
});

// ─── R2 Storage Provider Tests ───
describe('R2 Storage Error Injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw on upload failure (403)', async () => {
    s3SendMock.mockRejectedValue(new Error('Access Denied'));

    const provider = new R2StorageProvider();
    await expect(provider.upload('test.txt', Buffer.from('content'), 'text/plain')).rejects.toThrow(
      'Access Denied'
    );
  });

  it('should throw on delete failure', async () => {
    s3SendMock.mockRejectedValue(new Error('Service Unavailable'));

    const provider = new R2StorageProvider();
    await expect(provider.delete('test.txt')).rejects.toThrow('Service Unavailable');
  });

  it('should throw on empty Body in getStream', async () => {
    s3SendMock.mockResolvedValue({ Body: null, ContentType: 'text/plain' });

    const provider = new R2StorageProvider();
    await expect(provider.getStream('test.txt')).rejects.toThrow('No content');
  });

  it('should throw on empty Body in getBuffer', async () => {
    s3SendMock.mockResolvedValue({ Body: null });

    const provider = new R2StorageProvider();
    await expect(provider.getBuffer('test.txt')).rejects.toThrow('No content');
  });
});
