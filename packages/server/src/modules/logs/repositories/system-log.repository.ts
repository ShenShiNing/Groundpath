import { v4 as uuidv4 } from 'uuid';
import { hostname } from 'os';
import { desc, eq, and, lt, sql, inArray } from 'drizzle-orm';
import { db } from '@shared/db';
import {
  systemLogs,
  type NewSystemLog,
  type SystemLog,
  type LogLevel,
  type LogCategory,
} from '@shared/db/schema/system/system-logs.schema';

export interface SystemLogListParams {
  page: number;
  pageSize: number;
  level?: LogLevel;
  category?: LogCategory;
  startDate?: Date;
  endDate?: Date;
}

export interface CreateSystemLogInput {
  level: LogLevel;
  category: LogCategory;
  event: string;
  message: string;
  source?: string | null;
  traceId?: string | null;
  errorCode?: string | null;
  errorStack?: string | null;
  durationMs?: number | null;
  metadata?: unknown;
}

export interface StructuredRagAlertLogEntry {
  id: string;
  event: string;
  code: string;
  severity: string | null;
  createdAt: Date;
}

export const systemLogRepository = {
  /**
   * Create a new system log entry
   */
  async create(input: CreateSystemLogInput): Promise<SystemLog> {
    const logEntry: NewSystemLog = {
      id: uuidv4(),
      level: input.level,
      category: input.category,
      event: input.event,
      message: input.message,
      source: input.source ?? null,
      traceId: input.traceId ?? null,
      errorCode: input.errorCode ?? null,
      errorStack: input.errorStack ?? null,
      durationMs: input.durationMs ?? null,
      metadata: input.metadata ?? null,
      hostname: hostname(),
      processId: process.pid,
    };

    await db.insert(systemLogs).values(logEntry);

    return {
      ...logEntry,
      createdAt: new Date(),
    } as SystemLog;
  },

  /**
   * List system logs with pagination and filtering
   */
  async list(params: SystemLogListParams): Promise<{ logs: SystemLog[]; total: number }> {
    const { page, pageSize, level, category, startDate, endDate } = params;
    const offset = (page - 1) * pageSize;

    const conditions = [];

    if (level) {
      conditions.push(eq(systemLogs.level, level));
    }
    if (category) {
      conditions.push(eq(systemLogs.category, category));
    }
    if (startDate) {
      conditions.push(sql`${systemLogs.createdAt} >= ${startDate}`);
    }
    if (endDate) {
      conditions.push(sql`${systemLogs.createdAt} <= ${endDate}`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [logs, countResult] = await Promise.all([
      db
        .select()
        .from(systemLogs)
        .where(whereClause)
        .orderBy(desc(systemLogs.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(systemLogs)
        .where(whereClause),
    ]);

    return {
      logs,
      total: countResult[0]?.count ?? 0,
    };
  },

  /**
   * Get statistics by level and category
   */
  async getStats(hours: number = 24): Promise<{
    byLevel: Record<LogLevel, number>;
    byCategory: Record<LogCategory, number>;
  }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [levelStats, categoryStats] = await Promise.all([
      db
        .select({
          level: systemLogs.level,
          count: sql<number>`count(*)`,
        })
        .from(systemLogs)
        .where(sql`${systemLogs.createdAt} >= ${since}`)
        .groupBy(systemLogs.level),
      db
        .select({
          category: systemLogs.category,
          count: sql<number>`count(*)`,
        })
        .from(systemLogs)
        .where(sql`${systemLogs.createdAt} >= ${since}`)
        .groupBy(systemLogs.category),
    ]);

    const byLevel = levelStats.reduce(
      (acc, { level, count }) => {
        acc[level] = count;
        return acc;
      },
      {} as Record<LogLevel, number>
    );

    const byCategory = categoryStats.reduce(
      (acc, { category, count }) => {
        acc[category] = count;
        return acc;
      },
      {} as Record<LogCategory, number>
    );

    return { byLevel, byCategory };
  },

  /**
   * Delete logs older than specified date (for cleanup)
   */
  async deleteOlderThan(date: Date, batchSize: number = 1000): Promise<number> {
    // Get IDs of old logs in batches
    const oldLogs = await db
      .select({ id: systemLogs.id })
      .from(systemLogs)
      .where(lt(systemLogs.createdAt, date))
      .limit(batchSize);

    if (oldLogs.length === 0) {
      return 0;
    }

    const ids = oldLogs.map((log) => log.id);
    await db.delete(systemLogs).where(inArray(systemLogs.id, ids));

    return ids.length;
  },

  async getLatestStructuredRagAlertEvents(codes: string[]): Promise<StructuredRagAlertLogEntry[]> {
    if (codes.length === 0) return [];

    const rows = await db.execute(sql`
      SELECT
        ${systemLogs.id} AS id,
        ${systemLogs.event} AS event,
        JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.code')) AS code,
        JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.severity')) AS severity,
        ${systemLogs.createdAt} AS createdAt
      FROM ${systemLogs}
      WHERE ${systemLogs.event} = 'structured-rag.alert.sent'
        AND JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.code')) IN (${sql.join(
          codes.map((code) => sql`${code}`),
          sql`, `
        )})
      ORDER BY ${systemLogs.createdAt} DESC
    `);

    const rawRows = (rows[0] as unknown as Array<Record<string, unknown>>) ?? [];
    const latestByCode = new Map<string, StructuredRagAlertLogEntry>();

    for (const row of rawRows) {
      const code = String(row.code ?? '');
      if (!code || latestByCode.has(code)) continue;
      latestByCode.set(code, {
        id: String(row.id),
        event: String(row.event),
        code,
        severity: row.severity == null ? null : String(row.severity),
        createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(String(row.createdAt)),
      });
    }

    return [...latestByCode.values()];
  },
};
