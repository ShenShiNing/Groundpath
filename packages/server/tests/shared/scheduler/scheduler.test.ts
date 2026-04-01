import { beforeEach, describe, expect, it, vi } from 'vitest';

const scheduleMock = vi.fn();
const loggerInfoMock = vi.fn();
const loggerWarnMock = vi.fn();
const loggerErrorMock = vi.fn();
const schedulerErrorMock = vi.fn();

const logCleanupRunMock = vi.fn();
const conversationCleanupMock = vi.fn();
const tokenCleanupRunMock = vi.fn();
const vectorCleanupRunMock = vi.fn();
const counterSyncAllMock = vi.fn();
const structuredRagAlertCheckMock = vi.fn();
const processingRecoveryRecoverMock = vi.fn();
const documentIndexArtifactCleanupMock = vi.fn();

interface SchedulerImportOptions {
  cleanupEnabled?: boolean;
  counterSyncEnabled?: boolean;
  structuredRagAlertsEnabled?: boolean;
  backfillScheduleEnabled?: boolean;
  processingRecoveryEnabled?: boolean;
  buildCleanupEnabled?: boolean;
}

async function importScheduler(options: SchedulerImportOptions = {}) {
  const {
    cleanupEnabled = true,
    counterSyncEnabled = true,
    structuredRagAlertsEnabled = false,
    backfillScheduleEnabled = false,
    processingRecoveryEnabled = true,
    buildCleanupEnabled = true,
  } = options;

  vi.resetModules();
  vi.clearAllMocks();

  vi.doMock('node-cron', () => ({
    default: {
      schedule: scheduleMock,
    },
  }));

  vi.doMock('@core/config/env', () => ({
    loggingConfig: {
      cleanup: {
        enabled: cleanupEnabled,
      },
    },
    documentConfig: {
      processingRecoveryEnabled,
      processingRecoveryCron: '*/10 * * * *',
      processingTimeoutMinutes: 30,
      buildCleanupEnabled,
      buildCleanupCron: '30 3 * * *',
      buildCleanupRetentionDays: 7,
    },
    featureFlags: {
      counterSyncEnabled,
    },
    backfillScheduleConfig: {
      enabled: backfillScheduleEnabled,
      cron: '0 2 * * *',
    },
    structuredRagObservabilityConfig: {
      alertsEnabled: structuredRagAlertsEnabled,
      alertScheduleCron: '0 5 * * *',
    },
  }));

  vi.doMock('@core/logger', () => ({
    createLogger: vi.fn(() => ({
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    })),
  }));

  vi.doMock('@core/logger/system-logger', () => ({
    systemLogger: {
      schedulerError: schedulerErrorMock,
      schedulerRun: vi.fn(),
    },
  }));

  vi.doMock('@modules/logs/public/cleanup', () => ({
    logCleanupService: {
      runCleanup: logCleanupRunMock,
    },
  }));

  vi.doMock('@modules/chat/public/cleanup', () => ({
    conversationCleanupService: {
      cleanup: conversationCleanupMock,
    },
  }));

  vi.doMock('@modules/logs/public/alerts', () => ({
    structuredRagAlertService: {
      checkAndNotify: structuredRagAlertCheckMock,
    },
  }));

  vi.doMock('@modules/auth', () => ({
    tokenCleanupService: {
      runCleanup: tokenCleanupRunMock,
    },
  }));

  vi.doMock('@modules/knowledge-base/public/counters', () => ({
    counterSyncService: {
      syncAll: counterSyncAllMock,
    },
  }));

  vi.doMock('@modules/vector/public/cleanup', () => ({
    vectorCleanupService: {
      runCleanup: vectorCleanupRunMock,
    },
  }));

  vi.doMock('@modules/rag', () => ({
    processingRecoveryService: {
      recoverStaleProcessing: processingRecoveryRecoverMock,
    },
  }));

  vi.doMock('@modules/document-index/public/backfill', () => ({
    documentIndexBackfillService: {
      runScheduledBackfill: vi.fn(),
    },
  }));

  vi.doMock('@modules/document-index/public/cleanup', () => ({
    documentIndexArtifactCleanupService: {
      cleanup: documentIndexArtifactCleanupMock,
    },
  }));

  return import('@core/scheduler');
}

describe('shared/scheduler', () => {
  beforeEach(() => {
    scheduleMock.mockReset();
    loggerInfoMock.mockReset();
    loggerWarnMock.mockReset();
    loggerErrorMock.mockReset();
    schedulerErrorMock.mockReset();
    logCleanupRunMock.mockReset();
    conversationCleanupMock.mockReset();
    tokenCleanupRunMock.mockReset();
    vectorCleanupRunMock.mockReset();
    counterSyncAllMock.mockReset();
    structuredRagAlertCheckMock.mockReset();
    processingRecoveryRecoverMock.mockReset();
    documentIndexArtifactCleanupMock.mockReset();
  });

  it('should schedule cleanup and counter-sync tasks with UTC timezone and avoid double init', async () => {
    const scheduler = await importScheduler();

    scheduler.initializeScheduler();

    expect(scheduleMock).toHaveBeenCalledTimes(4);
    expect(scheduleMock).toHaveBeenCalledWith('0 3 * * *', expect.any(Function), {
      timezone: 'UTC',
    });
    expect(scheduleMock).toHaveBeenCalledWith('0 4 * * 0', expect.any(Function), {
      timezone: 'UTC',
    });
    expect(scheduleMock).toHaveBeenCalledWith('*/10 * * * *', expect.any(Function), {
      timezone: 'UTC',
    });
    expect(scheduleMock).toHaveBeenCalledWith('30 3 * * *', expect.any(Function), {
      timezone: 'UTC',
    });

    scheduler.initializeScheduler();
    expect(loggerWarnMock).toHaveBeenCalledWith('Scheduler already initialized');
    expect(scheduleMock).toHaveBeenCalledTimes(4);
  });

  it('should continue cleanup pipeline when one scheduled cleanup task fails', async () => {
    const scheduler = await importScheduler();

    logCleanupRunMock.mockResolvedValueOnce({ deleted: 1 });
    tokenCleanupRunMock.mockRejectedValueOnce(new Error('token cleanup failed'));
    vectorCleanupRunMock.mockResolvedValueOnce({
      collectionsProcessed: 1,
      totalPurged: 0,
      errors: 0,
    });
    documentIndexArtifactCleanupMock.mockResolvedValueOnce({
      scannedCount: 1,
      cleanedCount: 1,
      skippedCount: 0,
      failedCount: 0,
    });

    scheduler.initializeScheduler();

    const cleanupTaskCall = scheduleMock.mock.calls.find((call) => call[0] === '0 3 * * *');
    const cleanupTask = cleanupTaskCall?.[1] as (() => Promise<void>) | undefined;
    expect(cleanupTask).toBeTypeOf('function');

    await cleanupTask!();

    expect(logCleanupRunMock).toHaveBeenCalledTimes(1);
    expect(conversationCleanupMock).toHaveBeenCalledTimes(1);
    expect(tokenCleanupRunMock).toHaveBeenCalledTimes(1);
    expect(vectorCleanupRunMock).toHaveBeenCalledTimes(1);
    expect(documentIndexArtifactCleanupMock).not.toHaveBeenCalled();
    expect(schedulerErrorMock).toHaveBeenCalledWith('cleanup.failed', expect.any(Error));
  });

  it('should run immutable build cleanup on its dedicated schedule', async () => {
    const scheduler = await importScheduler();

    documentIndexArtifactCleanupMock.mockResolvedValueOnce({
      scannedCount: 2,
      cleanedCount: 1,
      skippedCount: 1,
      failedCount: 0,
    });

    scheduler.initializeScheduler();

    const cleanupTaskCall = scheduleMock.mock.calls.find((call) => call[0] === '30 3 * * *');
    const cleanupTask = cleanupTaskCall?.[1] as (() => Promise<void>) | undefined;
    expect(cleanupTask).toBeTypeOf('function');

    await cleanupTask!();

    expect(documentIndexArtifactCleanupMock).toHaveBeenCalledTimes(1);
  });

  it('should report scheduler error when weekly counter-sync throws', async () => {
    const scheduler = await importScheduler();

    counterSyncAllMock.mockRejectedValueOnce(new Error('counter sync failed'));

    scheduler.initializeScheduler();

    const counterTaskCall = scheduleMock.mock.calls.find((call) => call[0] === '0 4 * * 0');
    const counterTask = counterTaskCall?.[1] as (() => Promise<void>) | undefined;
    expect(counterTask).toBeTypeOf('function');

    await counterTask!();

    expect(counterSyncAllMock).toHaveBeenCalledTimes(1);
    expect(schedulerErrorMock).toHaveBeenCalledWith('counter-sync.failed', expect.any(Error));
  });

  it('should report scheduler error when stale processing recovery throws', async () => {
    const scheduler = await importScheduler({
      cleanupEnabled: false,
      counterSyncEnabled: false,
      structuredRagAlertsEnabled: false,
      processingRecoveryEnabled: true,
      buildCleanupEnabled: false,
    });

    processingRecoveryRecoverMock.mockRejectedValueOnce(new Error('recovery failed'));

    scheduler.initializeScheduler();

    const recoveryTaskCall = scheduleMock.mock.calls.find((call) => call[0] === '*/10 * * * *');
    const recoveryTask = recoveryTaskCall?.[1] as (() => Promise<void>) | undefined;
    expect(recoveryTask).toBeTypeOf('function');

    await recoveryTask!();

    expect(processingRecoveryRecoverMock).toHaveBeenCalledTimes(1);
    expect(schedulerErrorMock).toHaveBeenCalledWith(
      'document-processing.recovery.failed',
      expect.any(Error)
    );
  });

  it('should expose manual cleanup triggers', async () => {
    const scheduler = await importScheduler();

    logCleanupRunMock.mockResolvedValueOnce({ deleted: 1 });
    tokenCleanupRunMock.mockResolvedValueOnce({ deleted: 2 });
    vectorCleanupRunMock.mockResolvedValueOnce({
      collectionsProcessed: 1,
      totalPurged: 3,
      errors: 0,
    });
    documentIndexArtifactCleanupMock.mockResolvedValueOnce({
      scannedCount: 1,
      cleanedCount: 1,
      skippedCount: 0,
      failedCount: 0,
    });

    await scheduler.triggerLogCleanup();
    await scheduler.triggerTokenCleanup();
    await scheduler.triggerVectorCleanup();
    await scheduler.triggerDocumentProcessingRecovery();
    await scheduler.triggerDocumentIndexArtifactCleanup();

    expect(logCleanupRunMock).toHaveBeenCalledTimes(1);
    expect(tokenCleanupRunMock).toHaveBeenCalledTimes(1);
    expect(vectorCleanupRunMock).toHaveBeenCalledTimes(1);
    expect(processingRecoveryRecoverMock).toHaveBeenCalledTimes(1);
    expect(documentIndexArtifactCleanupMock).toHaveBeenCalledTimes(1);
  });

  it('should initialize without tasks when all scheduler flags are disabled', async () => {
    const scheduler = await importScheduler({
      cleanupEnabled: false,
      counterSyncEnabled: false,
      structuredRagAlertsEnabled: false,
      processingRecoveryEnabled: false,
      buildCleanupEnabled: false,
    });

    scheduler.initializeScheduler();

    expect(scheduleMock).not.toHaveBeenCalled();
    expect(loggerInfoMock).toHaveBeenCalledWith('Scheduler initialized - no tasks enabled');
  });

  it('should schedule structured rag alert checks when alerts are enabled', async () => {
    const scheduler = await importScheduler({
      cleanupEnabled: false,
      counterSyncEnabled: false,
      structuredRagAlertsEnabled: true,
      processingRecoveryEnabled: false,
      buildCleanupEnabled: false,
    });

    structuredRagAlertCheckMock.mockResolvedValueOnce({
      alertsTriggered: 1,
      emailSent: true,
      recipients: ['ops@example.com'],
    });

    scheduler.initializeScheduler();

    expect(scheduleMock).toHaveBeenCalledWith('0 5 * * *', expect.any(Function), {
      timezone: 'UTC',
    });

    const alertTaskCall = scheduleMock.mock.calls.find((call) => call[0] === '0 5 * * *');
    const alertTask = alertTaskCall?.[1] as (() => Promise<void>) | undefined;
    expect(alertTask).toBeTypeOf('function');

    await alertTask!();

    expect(structuredRagAlertCheckMock).toHaveBeenCalledTimes(1);
  });
});
