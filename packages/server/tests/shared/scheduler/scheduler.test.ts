import { beforeEach, describe, expect, it, vi } from 'vitest';

const scheduleMock = vi.fn();
const loggerInfoMock = vi.fn();
const loggerWarnMock = vi.fn();
const loggerErrorMock = vi.fn();
const schedulerErrorMock = vi.fn();

const logCleanupRunMock = vi.fn();
const tokenCleanupRunMock = vi.fn();
const vectorCleanupRunMock = vi.fn();
const counterSyncAllMock = vi.fn();
const structuredRagAlertCheckMock = vi.fn();

interface SchedulerImportOptions {
  cleanupEnabled?: boolean;
  counterSyncEnabled?: boolean;
  structuredRagAlertsEnabled?: boolean;
}

async function importScheduler(options: SchedulerImportOptions = {}) {
  const {
    cleanupEnabled = true,
    counterSyncEnabled = true,
    structuredRagAlertsEnabled = false,
  } = options;

  vi.resetModules();
  vi.clearAllMocks();

  vi.doMock('node-cron', () => ({
    default: {
      schedule: scheduleMock,
    },
  }));

  vi.doMock('@shared/config/env', () => ({
    loggingConfig: {
      cleanup: {
        enabled: cleanupEnabled,
      },
    },
    featureFlags: {
      counterSyncEnabled,
    },
    structuredRagObservabilityConfig: {
      alertsEnabled: structuredRagAlertsEnabled,
      alertScheduleCron: '0 5 * * *',
    },
  }));

  vi.doMock('@shared/logger', () => ({
    createLogger: vi.fn(() => ({
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    })),
  }));

  vi.doMock('@shared/logger/system-logger', () => ({
    systemLogger: {
      schedulerError: schedulerErrorMock,
    },
  }));

  vi.doMock('@modules/logs', () => ({
    logCleanupService: {
      runCleanup: logCleanupRunMock,
    },
    structuredRagAlertService: {
      checkAndNotify: structuredRagAlertCheckMock,
    },
  }));

  vi.doMock('@modules/auth', () => ({
    tokenCleanupService: {
      runCleanup: tokenCleanupRunMock,
    },
  }));

  vi.doMock('@modules/knowledge-base', () => ({
    counterSyncService: {
      syncAll: counterSyncAllMock,
    },
  }));

  vi.doMock('@modules/vector', () => ({
    vectorCleanupService: {
      runCleanup: vectorCleanupRunMock,
    },
  }));

  return import('@shared/scheduler');
}

describe('shared/scheduler', () => {
  beforeEach(() => {
    scheduleMock.mockReset();
    loggerInfoMock.mockReset();
    loggerWarnMock.mockReset();
    loggerErrorMock.mockReset();
    schedulerErrorMock.mockReset();
    logCleanupRunMock.mockReset();
    tokenCleanupRunMock.mockReset();
    vectorCleanupRunMock.mockReset();
    counterSyncAllMock.mockReset();
    structuredRagAlertCheckMock.mockReset();
  });

  it('should schedule cleanup and counter-sync tasks with UTC timezone and avoid double init', async () => {
    const scheduler = await importScheduler();

    scheduler.initializeScheduler();

    expect(scheduleMock).toHaveBeenCalledTimes(2);
    expect(scheduleMock).toHaveBeenCalledWith('0 3 * * *', expect.any(Function), {
      timezone: 'UTC',
    });
    expect(scheduleMock).toHaveBeenCalledWith('0 4 * * 0', expect.any(Function), {
      timezone: 'UTC',
    });

    scheduler.initializeScheduler();
    expect(loggerWarnMock).toHaveBeenCalledWith('Scheduler already initialized');
    expect(scheduleMock).toHaveBeenCalledTimes(2);
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

    scheduler.initializeScheduler();

    const cleanupTaskCall = scheduleMock.mock.calls.find((call) => call[0] === '0 3 * * *');
    const cleanupTask = cleanupTaskCall?.[1] as (() => Promise<void>) | undefined;
    expect(cleanupTask).toBeTypeOf('function');

    await cleanupTask!();

    expect(logCleanupRunMock).toHaveBeenCalledTimes(1);
    expect(tokenCleanupRunMock).toHaveBeenCalledTimes(1);
    expect(vectorCleanupRunMock).toHaveBeenCalledTimes(1);
    expect(schedulerErrorMock).toHaveBeenCalledWith('cleanup.failed', expect.any(Error));
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

  it('should expose manual cleanup triggers', async () => {
    const scheduler = await importScheduler();

    logCleanupRunMock.mockResolvedValueOnce({ deleted: 1 });
    tokenCleanupRunMock.mockResolvedValueOnce({ deleted: 2 });
    vectorCleanupRunMock.mockResolvedValueOnce({
      collectionsProcessed: 1,
      totalPurged: 3,
      errors: 0,
    });

    await scheduler.triggerLogCleanup();
    await scheduler.triggerTokenCleanup();
    await scheduler.triggerVectorCleanup();

    expect(logCleanupRunMock).toHaveBeenCalledTimes(1);
    expect(tokenCleanupRunMock).toHaveBeenCalledTimes(1);
    expect(vectorCleanupRunMock).toHaveBeenCalledTimes(1);
  });

  it('should initialize without tasks when all scheduler flags are disabled', async () => {
    const scheduler = await importScheduler({
      cleanupEnabled: false,
      counterSyncEnabled: false,
      structuredRagAlertsEnabled: false,
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
