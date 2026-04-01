import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteSoftDeletedOlderThanMock, loggerInfoMock, schedulerRunMock } = vi.hoisted(() => ({
  deleteSoftDeletedOlderThanMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  schedulerRunMock: vi.fn(),
}));

vi.mock('@core/config/env/configs', () => ({
  chatConfig: {
    deletedConversationRetentionDays: 30,
    deletedConversationCleanupBatchSize: 2,
  },
}));

vi.mock('@core/logger', () => ({
  createLogger: () => ({
    info: loggerInfoMock,
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@core/logger/system-logger', () => ({
  systemLogger: {
    schedulerRun: schedulerRunMock,
  },
}));

vi.mock('@modules/chat/repositories/conversation.repository', () => ({
  conversationRepository: {
    deleteSoftDeletedOlderThan: deleteSoftDeletedOlderThanMock,
  },
}));

import { conversationCleanupService } from '@modules/chat/services/conversation-cleanup.service';

describe('conversation-cleanup.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delete soft-deleted conversations in batches until exhausted', async () => {
    deleteSoftDeletedOlderThanMock.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

    const now = new Date('2026-04-30T00:00:00.000Z');
    const result = await conversationCleanupService.cleanup(now);

    expect(deleteSoftDeletedOlderThanMock).toHaveBeenNthCalledWith(
      1,
      new Date('2026-03-31T00:00:00.000Z'),
      2
    );
    expect(deleteSoftDeletedOlderThanMock).toHaveBeenNthCalledWith(
      2,
      new Date('2026-03-31T00:00:00.000Z'),
      2
    );
    expect(result.deletedConversations).toBe(3);
    expect(schedulerRunMock).toHaveBeenCalledWith(
      'chat.cleanup',
      'Scheduled soft-deleted conversation cleanup completed',
      expect.any(Number),
      {
        deletedConversations: 3,
        retentionDays: 30,
      }
    );
  });

  it('should report zero when no soft-deleted conversations are eligible', async () => {
    deleteSoftDeletedOlderThanMock.mockResolvedValue(0);

    const result = await conversationCleanupService.cleanup(new Date('2026-04-02T00:00:00.000Z'));

    expect(result.deletedConversations).toBe(0);
    expect(deleteSoftDeletedOlderThanMock).toHaveBeenCalledTimes(1);
    expect(schedulerRunMock).toHaveBeenCalledTimes(1);
  });
});
