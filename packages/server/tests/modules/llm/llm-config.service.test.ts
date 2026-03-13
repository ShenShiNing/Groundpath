import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repository: {
    findByUserId: vi.fn(),
    deleteByUserId: vi.fn(),
    updateByUserId: vi.fn(),
    create: vi.fn(),
  },
  encryptionService: {
    encrypt: vi.fn(),
    decrypt: vi.fn(),
    maskApiKey: vi.fn((value: string) => `****${value.slice(-4)}`),
  },
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@modules/llm/repositories/llm-config.repository', () => ({
  llmConfigRepository: mocks.repository,
}));

vi.mock('@modules/llm/services/encryption.service', () => ({
  encryptionService: mocks.encryptionService,
}));

vi.mock('@core/logger', () => ({
  logger: mocks.logger,
}));

vi.mock('uuid', () => ({
  v4: () => 'cfg-new',
}));

import { llmConfigService } from '@modules/llm/services/llm-config.service';

const configFixture = {
  id: 'cfg-1',
  userId: 'user-1',
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKeyEncrypted: 'ciphertext',
  baseUrl: null,
  temperature: '0.70',
  maxTokens: 2048,
  topP: '1.00',
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  updatedAt: new Date('2026-03-02T00:00:00.000Z'),
};

describe('llmConfigService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repository.findByUserId.mockResolvedValue(configFixture);
  });

  it('marks saved api keys as unreadable in config responses when decryption fails', async () => {
    mocks.encryptionService.decrypt.mockImplementation(() => {
      throw new Error('bad decrypt');
    });

    const result = await llmConfigService.getConfig('user-1');

    expect(result).toMatchObject({
      id: 'cfg-1',
      hasApiKey: false,
      apiKeyMasked: null,
      apiKeyStatus: 'unreadable',
    });
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });

  it('throws an actionable error when internal reads hit an unreadable saved api key', async () => {
    mocks.encryptionService.decrypt.mockImplementation(() => {
      throw new Error('bad decrypt');
    });

    await expect(llmConfigService.getFullConfig('user-1')).rejects.toMatchObject({
      code: 'LLM_DECRYPTION_FAILED',
      statusCode: 409,
      message: 'Saved API key can no longer be decrypted. Please update it in AI Settings.',
    });
    expect(mocks.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        error: expect.any(Error),
      }),
      'Failed to decrypt API key'
    );
  });
});
