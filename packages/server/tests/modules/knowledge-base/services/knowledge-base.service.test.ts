import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@core/errors';

const mockEmbeddingConfig = vi.hoisted(() => ({
  openai: {
    apiKey: 'openai-test-key',
    model: 'text-embedding-3-small',
    dimensions: 1536,
  },
  zhipu: {
    apiKey: 'zhipu-test-key',
    model: 'embedding-3',
    dimensions: 1024,
  },
  ollama: {
    apiKey: '',
    model: 'nomic-embed-text',
    dimensions: 768,
    baseUrl: 'http://localhost:11434',
  },
}));

const logOperationMock = vi.hoisted(() => vi.fn());

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'kb-generated-id'),
}));

vi.mock('@config/env', async (importOriginal) => {
  const original = await importOriginal<typeof import('@config/env')>();
  return {
    ...original,
    embeddingConfig: mockEmbeddingConfig,
  };
});

vi.mock('@core/logger/operation-logger', () => ({
  logOperation: logOperationMock,
}));

vi.mock('@modules/knowledge-base/repositories/knowledge-base.repository', () => ({
  knowledgeBaseRepository: {
    create: vi.fn(),
    findByIdAndUser: vi.fn(),
    lockByIdAndUser: vi.fn(),
    listByUser: vi.fn(),
    countByUser: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    findById: vi.fn(),
    incrementDocumentCount: vi.fn(),
    incrementTotalChunks: vi.fn(),
  },
}));

import {
  knowledgeBaseService,
  getCollectionName,
} from '@modules/knowledge-base/services/knowledge-base.service';
import { knowledgeBaseRepository } from '@modules/knowledge-base/repositories/knowledge-base.repository';

const mockUserId = 'user-123';
const mockKbId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const mockNow = new Date('2026-02-17T00:00:00.000Z');

const mockKnowledgeBase = {
  id: mockKbId,
  userId: mockUserId,
  name: 'AI Knowledge Base',
  description: 'Knowledge base for AI docs',
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  embeddingDimensions: 1536,
  documentCount: 2,
  totalChunks: 16,
  createdBy: mockUserId,
  createdAt: mockNow,
  updatedBy: mockUserId,
  updatedAt: mockNow,
  deletedBy: null,
  deletedAt: null,
};

describe('knowledgeBaseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbeddingConfig.openai.apiKey = 'openai-test-key';
    mockEmbeddingConfig.zhipu.apiKey = 'zhipu-test-key';
    mockEmbeddingConfig.openai.model = 'text-embedding-3-small';
    mockEmbeddingConfig.ollama.model = 'nomic-embed-text';
    vi.mocked(knowledgeBaseRepository.create).mockResolvedValue(mockKnowledgeBase);
    vi.mocked(knowledgeBaseRepository.findByIdAndUser).mockResolvedValue(mockKnowledgeBase);
    vi.mocked(knowledgeBaseRepository.findById).mockResolvedValue(mockKnowledgeBase);
    vi.mocked(knowledgeBaseRepository.update).mockResolvedValue(mockKnowledgeBase);
    vi.mocked(knowledgeBaseRepository.listByUser).mockResolvedValue([mockKnowledgeBase]);
    vi.mocked(knowledgeBaseRepository.countByUser).mockResolvedValue(1);
  });

  it('should format collection names consistently', () => {
    expect(getCollectionName('openai', 1536)).toBe('embedding_openai_1536');
    expect(getCollectionName('zhipu', 1024)).toBe('embedding_zhipu_1024');
  });

  it('should create knowledge base with provider-derived embedding config', async () => {
    const result = await knowledgeBaseService.create(
      mockUserId,
      {
        name: 'My KB',
        description: 'desc',
        embeddingProvider: 'openai',
      },
      { ipAddress: '127.0.0.1', userAgent: 'vitest' }
    );

    expect(knowledgeBaseRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'kb-generated-id',
        userId: mockUserId,
        name: 'My KB',
        embeddingProvider: 'openai',
        embeddingModel: 'text-embedding-3-small',
        embeddingDimensions: 1536,
      })
    );
    expect(logOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'knowledge_base.create',
        resourceId: 'kb-generated-id',
      })
    );
    expect(result.id).toBe(mockKbId);
    expect(result.embeddingProvider).toBe('openai');
  });

  it('should resolve ollama dimensions from model map when creating', async () => {
    vi.mocked(knowledgeBaseRepository.create).mockResolvedValue({
      ...mockKnowledgeBase,
      embeddingProvider: 'ollama',
      embeddingModel: 'nomic-embed-text',
      embeddingDimensions: 768,
    });

    const result = await knowledgeBaseService.create(mockUserId, {
      name: 'Ollama KB',
      embeddingProvider: 'ollama',
    });

    expect(knowledgeBaseRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        embeddingProvider: 'ollama',
        embeddingModel: 'nomic-embed-text',
        embeddingDimensions: 768,
      })
    );
    expect(result.embeddingProvider).toBe('ollama');
    expect(result.embeddingDimensions).toBe(768);
  });

  it('should reject create when openai api key is missing', async () => {
    mockEmbeddingConfig.openai.apiKey = '';

    await expect(
      knowledgeBaseService.create(mockUserId, {
        name: 'OpenAI KB',
        embeddingProvider: 'openai',
      })
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
    expect(knowledgeBaseRepository.create).not.toHaveBeenCalled();
  });

  it('should reject create for unsupported provider', async () => {
    const invalidProvider = 'unsupported-provider' as unknown as 'openai';

    await expect(
      knowledgeBaseService.create(mockUserId, {
        name: 'Bad KB',
        embeddingProvider: invalidProvider,
      })
    ).rejects.toMatchObject({
      code: 'INVALID_EMBEDDING_PROVIDER',
      statusCode: 400,
    });
  });

  it('should throw not found when getting knowledge base by id', async () => {
    vi.mocked(knowledgeBaseRepository.findByIdAndUser).mockResolvedValue(undefined);

    await expect(knowledgeBaseService.getById(mockKbId, mockUserId)).rejects.toMatchObject({
      code: 'KNOWLEDGE_BASE_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('should list and map user knowledge bases', async () => {
    const result = await knowledgeBaseService.list(mockUserId);

    expect(knowledgeBaseRepository.listByUser).toHaveBeenCalledWith(mockUserId, {
      page: 1,
      pageSize: 20,
    });
    expect(knowledgeBaseRepository.countByUser).toHaveBeenCalledWith(mockUserId);
    expect(result).toMatchObject({
      knowledgeBases: [
        {
          id: mockKbId,
          name: 'AI Knowledge Base',
          embeddingProvider: 'openai',
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      },
    });
  });

  it('should update knowledge base and log operation', async () => {
    vi.mocked(knowledgeBaseRepository.update).mockResolvedValue({
      ...mockKnowledgeBase,
      name: 'Renamed KB',
      description: 'new description',
    });

    const result = await knowledgeBaseService.update(
      mockKbId,
      mockUserId,
      { name: 'Renamed KB', description: 'new description' },
      { ipAddress: '127.0.0.1', userAgent: 'vitest' }
    );

    expect(knowledgeBaseRepository.update).toHaveBeenCalledWith(
      mockKbId,
      expect.objectContaining({
        name: 'Renamed KB',
        description: 'new description',
        updatedBy: mockUserId,
      })
    );
    expect(logOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'knowledge_base.update',
        resourceId: mockKbId,
      })
    );
    expect(result.name).toBe('Renamed KB');
  });

  it('should delete knowledge base and write operation log', async () => {
    await knowledgeBaseService.delete(mockKbId, mockUserId, {
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    });

    expect(knowledgeBaseRepository.softDelete).toHaveBeenCalledWith(mockKbId, mockUserId);
    expect(logOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'knowledge_base.delete',
        resourceId: mockKbId,
      })
    );
  });

  it('should build embedding config with computed collection name', async () => {
    vi.mocked(knowledgeBaseRepository.findById).mockResolvedValue({
      ...mockKnowledgeBase,
      embeddingProvider: 'zhipu',
      embeddingModel: 'embedding-3',
      embeddingDimensions: 1024,
    });

    const result = await knowledgeBaseService.getEmbeddingConfig(mockKbId);

    expect(result).toEqual({
      provider: 'zhipu',
      model: 'embedding-3',
      dimensions: 1024,
      collectionName: 'embedding_zhipu_1024',
    });
  });

  it('should validate ownership and proxy counter increment operations', async () => {
    const owned = await knowledgeBaseService.validateOwnership(mockKbId, mockUserId);
    vi.mocked(knowledgeBaseRepository.lockByIdAndUser).mockResolvedValue(true);
    await knowledgeBaseService.lockOwnership(mockKbId, mockUserId, { id: 'tx-1' } as never);
    await knowledgeBaseService.incrementDocumentCount(mockKbId, 2);
    await knowledgeBaseService.incrementTotalChunks(mockKbId, 6);

    expect(owned.id).toBe(mockKbId);
    expect(knowledgeBaseRepository.lockByIdAndUser).toHaveBeenCalledWith(mockKbId, mockUserId, {
      id: 'tx-1',
    });
    expect(knowledgeBaseRepository.incrementDocumentCount).toHaveBeenCalledWith(
      mockKbId,
      2,
      undefined
    );
    expect(knowledgeBaseRepository.incrementTotalChunks).toHaveBeenCalledWith(
      mockKbId,
      6,
      undefined
    );
  });

  it('should throw access error when ownership validation fails', async () => {
    vi.mocked(knowledgeBaseRepository.findByIdAndUser).mockResolvedValue(undefined);

    await expect(
      knowledgeBaseService.validateOwnership(mockKbId, mockUserId)
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      knowledgeBaseService.validateOwnership(mockKbId, mockUserId)
    ).rejects.toMatchObject({
      code: 'KNOWLEDGE_BASE_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('should throw access error when row lock cannot be acquired', async () => {
    vi.mocked(knowledgeBaseRepository.lockByIdAndUser).mockResolvedValue(false);

    await expect(
      knowledgeBaseService.lockOwnership(mockKbId, mockUserId, { id: 'tx-1' } as never)
    ).rejects.toMatchObject({
      code: 'KNOWLEDGE_BASE_NOT_FOUND',
      statusCode: 404,
    });
  });
});
