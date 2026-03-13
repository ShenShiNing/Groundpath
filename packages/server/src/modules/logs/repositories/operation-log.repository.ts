import { v4 as uuidv4 } from 'uuid';
import { desc, eq, and, lt, sql, inArray } from 'drizzle-orm';
import { db } from '@core/db';
import {
  operationLogs,
  type NewOperationLog,
  type OperationLog,
  type ResourceType,
  type OperationAction,
} from '@core/db/schema/system/operation-logs.schema';

export interface OperationLogListParams {
  page: number;
  pageSize: number;
  resourceType?: ResourceType;
  action?: OperationAction;
  startDate?: Date;
  endDate?: Date;
}

export interface CreateOperationLogInput {
  userId: string;
  resourceType: ResourceType;
  resourceId?: string | null;
  resourceName?: string | null;
  action: OperationAction;
  description?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  status?: 'success' | 'failed';
  errorMessage?: string | null;
  durationMs?: number | null;
}

export const operationLogRepository = {
  /**
   * Create a new operation log entry
   */
  async create(input: CreateOperationLogInput): Promise<OperationLog> {
    const logEntry: NewOperationLog = {
      id: uuidv4(),
      userId: input.userId,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      resourceName: input.resourceName ?? null,
      action: input.action,
      description: input.description ?? null,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      metadata: input.metadata ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      status: input.status ?? 'success',
      errorMessage: input.errorMessage ?? null,
      durationMs: input.durationMs ?? null,
    };

    await db.insert(operationLogs).values(logEntry);

    return {
      ...logEntry,
      createdAt: new Date(),
    } as OperationLog;
  },

  /**
   * List operation logs with pagination and filtering
   */
  async list(
    userId: string,
    params: OperationLogListParams
  ): Promise<{ logs: OperationLog[]; total: number }> {
    const { page, pageSize, resourceType, action, startDate, endDate } = params;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(operationLogs.userId, userId)];

    if (resourceType) {
      conditions.push(eq(operationLogs.resourceType, resourceType));
    }
    if (action) {
      conditions.push(eq(operationLogs.action, action));
    }
    if (startDate) {
      conditions.push(sql`${operationLogs.createdAt} >= ${startDate}`);
    }
    if (endDate) {
      conditions.push(sql`${operationLogs.createdAt} <= ${endDate}`);
    }

    const whereClause = and(...conditions);

    const [logs, countResult] = await Promise.all([
      db
        .select()
        .from(operationLogs)
        .where(whereClause)
        .orderBy(desc(operationLogs.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(operationLogs)
        .where(whereClause),
    ]);

    return {
      logs,
      total: countResult[0]?.count ?? 0,
    };
  },

  /**
   * List logs by user ID
   */
  async listByUser(userId: string, limit: number = 50): Promise<OperationLog[]> {
    return db
      .select()
      .from(operationLogs)
      .where(eq(operationLogs.userId, userId))
      .orderBy(desc(operationLogs.createdAt))
      .limit(limit);
  },

  /**
   * List logs by resource
   */
  async listByResource(
    resourceType: ResourceType,
    resourceId: string,
    userId: string,
    limit: number = 50
  ): Promise<OperationLog[]> {
    return db
      .select()
      .from(operationLogs)
      .where(
        and(
          eq(operationLogs.resourceType, resourceType),
          eq(operationLogs.resourceId, resourceId),
          eq(operationLogs.userId, userId)
        )
      )
      .orderBy(desc(operationLogs.createdAt))
      .limit(limit);
  },

  /**
   * Delete logs older than specified date (for cleanup)
   */
  async deleteOlderThan(date: Date, batchSize: number = 1000): Promise<number> {
    // Get IDs of old logs in batches
    const oldLogs = await db
      .select({ id: operationLogs.id })
      .from(operationLogs)
      .where(lt(operationLogs.createdAt, date))
      .limit(batchSize);

    if (oldLogs.length === 0) {
      return 0;
    }

    const ids = oldLogs.map((log) => log.id);
    await db.delete(operationLogs).where(inArray(operationLogs.id, ids));

    return ids.length;
  },
};
