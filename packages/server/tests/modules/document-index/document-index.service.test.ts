import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  uuidV4: vi.fn(),
  documentIndexVersionRepository: {
    create: vi.fn(),
    update: vi.fn(),
  },
  documentIndexActivationService: {
    activateVersion: vi.fn(),
    markFailed: vi.fn(),
    markSuperseded: vi.fn(),
  },
}));

vi.mock('uuid', () => ({
  v4: mocks.uuidV4,
}));

vi.mock('@modules/document-index/repositories/document-index-version.repository', () => ({
  documentIndexVersionRepository: mocks.documentIndexVersionRepository,
}));

vi.mock('@modules/document-index/services/document-index-activation.service', () => ({
  documentIndexActivationService: mocks.documentIndexActivationService,
}));

import { documentIndexService } from '@modules/document-index/services/document-index.service';

describe('documentIndexService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uuidV4.mockReturnValueOnce('generated-index-version').mockReturnValueOnce('row-id');
  });

  it('starts an index build with generated ids when targetIndexVersion is absent', async () => {
    mocks.documentIndexVersionRepository.create.mockResolvedValue({ id: 'row-id' });

    const result = await documentIndexService.startBuild({
      documentId: 'doc-1',
      documentVersion: 2,
      routeMode: 'chunked',
      createdBy: 'user-1',
    });

    expect(mocks.documentIndexVersionRepository.create).toHaveBeenCalledWith({
      id: 'row-id',
      documentId: 'doc-1',
      documentVersion: 2,
      indexVersion: 'idx-generated-index-version',
      routeMode: 'chunked',
      status: 'building',
      workerJobId: null,
      createdBy: 'user-1',
    });
    expect(result).toEqual({ id: 'row-id' });
  });

  it('completes a build by updating metadata then activating it', async () => {
    mocks.documentIndexVersionRepository.update.mockResolvedValue(undefined);
    mocks.documentIndexActivationService.activateVersion.mockResolvedValue({ id: 'idx-row-1' });

    const result = await documentIndexService.completeBuild({
      indexVersionId: 'idx-row-1',
      parseMethod: 'chunked',
      parserRuntime: 'legacy-rag',
      headingCount: 0,
      parseDurationMs: 1234,
    });

    expect(mocks.documentIndexVersionRepository.update).toHaveBeenCalledWith('idx-row-1', {
      parseMethod: 'chunked',
      parserRuntime: 'legacy-rag',
      headingCount: 0,
      parseDurationMs: 1234,
      error: null,
    });
    expect(mocks.documentIndexActivationService.activateVersion).toHaveBeenCalledWith('idx-row-1');
    expect(result).toEqual({ id: 'idx-row-1' });
  });

  it('delegates failure and supersede transitions to activation service', async () => {
    await documentIndexService.failBuild('idx-row-2', 'boom');
    await documentIndexService.supersedeBuild('idx-row-3');

    expect(mocks.documentIndexActivationService.markFailed).toHaveBeenCalledWith(
      'idx-row-2',
      'boom'
    );
    expect(mocks.documentIndexActivationService.markSuperseded).toHaveBeenCalledWith('idx-row-3');
  });
});
