import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withTransaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({})),
  documentIndexVersionRepository: {
    findById: vi.fn(),
    update: vi.fn(),
    supersedeActiveByDocumentId: vi.fn(),
  },
  documentRepository: {
    findById: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@shared/db/db.utils', () => ({
  withTransaction: mocks.withTransaction,
}));

vi.mock('@shared/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@modules/document-index/repositories/document-index-version.repository', () => ({
  documentIndexVersionRepository: mocks.documentIndexVersionRepository,
}));

vi.mock('@modules/document', () => ({
  documentRepository: mocks.documentRepository,
}));

import { AppError } from '@shared/errors/app-error';
import { documentIndexActivationService } from '@modules/document-index';

describe('documentIndexActivationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('activates an index version and updates activeIndexVersionId', async () => {
    mocks.documentIndexVersionRepository.findById.mockResolvedValue({
      id: 'idx-row-1',
      documentId: 'doc-1',
      documentVersion: 3,
      indexVersion: 'idx-v3',
      status: 'building',
    });
    mocks.documentIndexVersionRepository.update.mockResolvedValue({
      id: 'idx-row-1',
      status: 'active',
    });
    mocks.documentRepository.update.mockResolvedValue(undefined);

    const result = await documentIndexActivationService.activateVersion('idx-row-1');

    expect(mocks.documentIndexVersionRepository.supersedeActiveByDocumentId).toHaveBeenCalledWith(
      'doc-1',
      'idx-row-1',
      expect.anything()
    );
    expect(mocks.documentIndexVersionRepository.update).toHaveBeenCalledWith(
      'idx-row-1',
      expect.objectContaining({
        status: 'active',
        error: null,
      }),
      expect.anything()
    );
    expect(mocks.documentRepository.update).toHaveBeenCalledWith(
      'doc-1',
      { activeIndexVersionId: 'idx-row-1' },
      expect.anything()
    );
    expect(result).toEqual({ id: 'idx-row-1', status: 'active' });
  });

  it('marks a version as failed and clears active pointer when needed', async () => {
    mocks.documentIndexVersionRepository.findById.mockResolvedValue({
      id: 'idx-row-2',
      documentId: 'doc-1',
      documentVersion: 4,
      indexVersion: 'idx-v4',
      status: 'active',
    });
    mocks.documentIndexVersionRepository.update.mockResolvedValue({
      id: 'idx-row-2',
      status: 'failed',
    });
    mocks.documentRepository.findById.mockResolvedValue({
      id: 'doc-1',
      activeIndexVersionId: 'idx-row-2',
    });

    const result = await documentIndexActivationService.markFailed('idx-row-2', 'parse failed');

    expect(mocks.documentIndexVersionRepository.update).toHaveBeenCalledWith(
      'idx-row-2',
      {
        status: 'failed',
        error: 'parse failed',
      },
      expect.anything()
    );
    expect(mocks.documentRepository.update).toHaveBeenCalledWith(
      'doc-1',
      { activeIndexVersionId: null },
      expect.anything()
    );
    expect(result).toEqual({ id: 'idx-row-2', status: 'failed' });
  });

  it('marks a version as superseded without touching unrelated active pointers', async () => {
    mocks.documentIndexVersionRepository.findById.mockResolvedValue({
      id: 'idx-row-3',
      documentId: 'doc-1',
      documentVersion: 5,
      indexVersion: 'idx-v5',
      status: 'building',
    });
    mocks.documentIndexVersionRepository.update.mockResolvedValue({
      id: 'idx-row-3',
      status: 'superseded',
    });
    mocks.documentRepository.findById.mockResolvedValue({
      id: 'doc-1',
      activeIndexVersionId: 'idx-row-1',
    });

    const result = await documentIndexActivationService.markSuperseded('idx-row-3');

    expect(mocks.documentIndexVersionRepository.update).toHaveBeenCalledWith(
      'idx-row-3',
      {
        status: 'superseded',
      },
      expect.anything()
    );
    expect(mocks.documentRepository.update).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'idx-row-3', status: 'superseded' });
  });

  it('throws not found when index version is missing', async () => {
    mocks.documentIndexVersionRepository.findById.mockResolvedValue(undefined);

    await expect(documentIndexActivationService.activateVersion('missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    } satisfies Partial<AppError>);
  });
});
