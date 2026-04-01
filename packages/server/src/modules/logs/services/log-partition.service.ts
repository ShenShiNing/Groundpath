import { sql } from 'drizzle-orm';
import { loggingConfig } from '@core/config/env';
import { db } from '@core/db';
import { createLogger } from '@core/logger';

const logger = createLogger('log-partition.service');

const PARTITIONED_LOG_TABLES = {
  loginLogs: 'login_logs',
  operationLogs: 'operation_logs',
} as const;

const MONTHLY_PARTITION_NAME_PATTERN = /^p(\d{4})(\d{2})$/;

interface RawPartitionInfoRow {
  partitionName: string | null;
}

interface PartitionInfoRow {
  partitionName: string;
}

interface TablePartitionMaintenanceResult {
  futurePartitionsAdded: number;
  expiredPartitionsDropped: number;
}

export interface LogPartitionMaintenanceResult {
  loginLogs: TablePartitionMaintenanceResult;
  operationLogs: TablePartitionMaintenanceResult;
}

function createEmptyTableResult(): TablePartitionMaintenanceResult {
  return {
    futurePartitionsAdded: 0,
    expiredPartitionsDropped: 0,
  };
}

export function createEmptyLogPartitionMaintenanceResult(): LogPartitionMaintenanceResult {
  return {
    loginLogs: createEmptyTableResult(),
    operationLogs: createEmptyTableResult(),
  };
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function compareMonthStarts(left: Date, right: Date): number {
  return left.getTime() - right.getTime();
}

function formatPartitionName(monthStart: Date): string {
  return `p${monthStart.getUTCFullYear()}${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMysqlUtcDateTime(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day} 00:00:00`;
}

function parseMonthlyPartitionName(partitionName: string | null): Date | null {
  if (!partitionName) return null;

  const match = MONTHLY_PARTITION_NAME_PATTERN.exec(partitionName);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, 1));
}

function buildMonthlyPartitionDefinition(monthStart: Date): string {
  const upperBound = addUtcMonths(monthStart, 1);
  return [
    `PARTITION ${formatPartitionName(monthStart)}`,
    `VALUES LESS THAN (UNIX_TIMESTAMP('${formatMysqlUtcDateTime(upperBound)}'))`,
  ].join(' ');
}

async function listPartitions(tableName: string): Promise<PartitionInfoRow[]> {
  const result = await db.execute(sql`
    SELECT PARTITION_NAME AS partitionName
    FROM information_schema.partitions
    WHERE table_schema = DATABASE()
      AND table_name = ${tableName}
      AND partition_name IS NOT NULL
    ORDER BY partition_ordinal_position
  `);

  return (((result[0] as unknown as RawPartitionInfoRow[]) ?? [])
    .map((row) => row.partitionName)
    .filter((partitionName): partitionName is string => !!partitionName)
    .map((partitionName) => ({ partitionName })));
}

async function dropExpiredPartitions(tableName: string, cutoffDate: Date): Promise<number> {
  const partitions = await listPartitions(tableName);

  if (partitions.length === 0) {
    logger.warn({ tableName }, 'Skipping partition drop because table is not partitioned');
    return 0;
  }

  const cutoffMonthStart = startOfUtcMonth(cutoffDate);
  const partitionNamesToDrop = partitions
    .map((partition) => partition.partitionName)
    .filter((partitionName): partitionName is string => {
      const monthStart = parseMonthlyPartitionName(partitionName);
      return monthStart !== null && compareMonthStarts(monthStart, cutoffMonthStart) < 0;
    });

  if (partitionNamesToDrop.length === 0) {
    return 0;
  }

  await db.execute(
    sql.raw(`ALTER TABLE \`${tableName}\` DROP PARTITION ${partitionNamesToDrop.join(', ')}`)
  );

  logger.info(
    {
      tableName,
      partitions: partitionNamesToDrop,
      cutoffDate,
    },
    'Dropped expired monthly partitions from log table'
  );

  return partitionNamesToDrop.length;
}

async function ensureFuturePartitions(tableName: string, now: Date): Promise<number> {
  const partitions = await listPartitions(tableName);

  if (partitions.length === 0) {
    logger.warn({ tableName }, 'Skipping future partition maintenance because table is not partitioned');
    return 0;
  }

  const hasMaxPartition = partitions.some((partition) => partition.partitionName === 'pmax');
  if (!hasMaxPartition) {
    logger.warn({ tableName }, 'Skipping future partition maintenance because pmax is missing');
    return 0;
  }

  const monthlyPartitions = partitions
    .map((partition) => parseMonthlyPartitionName(partition.partitionName))
    .filter((partition): partition is Date => partition !== null)
    .sort(compareMonthStarts);

  const latestExistingPartition = monthlyPartitions.at(-1);
  if (!latestExistingPartition) {
    logger.warn(
      { tableName },
      'Skipping future partition maintenance because no monthly partitions were found'
    );
    return 0;
  }

  const targetLatestPartition = addUtcMonths(
    startOfUtcMonth(now),
    loggingConfig.partitioning.futureMonths
  );

  if (compareMonthStarts(latestExistingPartition, targetLatestPartition) >= 0) {
    return 0;
  }

  const partitionDefinitions: string[] = [];
  for (
    let cursor = addUtcMonths(latestExistingPartition, 1);
    compareMonthStarts(cursor, targetLatestPartition) <= 0;
    cursor = addUtcMonths(cursor, 1)
  ) {
    partitionDefinitions.push(buildMonthlyPartitionDefinition(cursor));
  }

  await db.execute(
    sql.raw(
      `ALTER TABLE \`${tableName}\` REORGANIZE PARTITION pmax INTO (${partitionDefinitions.join(
        ', '
      )}, PARTITION pmax VALUES LESS THAN MAXVALUE)`
    )
  );

  logger.info(
    {
      tableName,
      addedPartitions: partitionDefinitions.length,
      targetLatestPartition: formatPartitionName(targetLatestPartition),
    },
    'Added future monthly partitions to log table'
  );

  return partitionDefinitions.length;
}

export const logPartitionService = {
  async maintainPartitions(input: {
    loginCutoff: Date;
    operationCutoff: Date;
    now?: Date;
  }): Promise<LogPartitionMaintenanceResult> {
    const now = input.now ?? new Date();

    return {
      loginLogs: {
        expiredPartitionsDropped: await dropExpiredPartitions(
          PARTITIONED_LOG_TABLES.loginLogs,
          input.loginCutoff
        ),
        futurePartitionsAdded: await ensureFuturePartitions(PARTITIONED_LOG_TABLES.loginLogs, now),
      },
      operationLogs: {
        expiredPartitionsDropped: await dropExpiredPartitions(
          PARTITIONED_LOG_TABLES.operationLogs,
          input.operationCutoff
        ),
        futurePartitionsAdded: await ensureFuturePartitions(
          PARTITIONED_LOG_TABLES.operationLogs,
          now
        ),
      },
    };
  },
};
