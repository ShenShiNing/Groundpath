import { sql } from 'drizzle-orm';
import { db } from './index';

// ============================================================================
// Transaction Types and Utilities
// ============================================================================

/**
 * Transaction type - represents a Drizzle transaction context
 * Use this type for functions that can optionally accept a transaction
 */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Database context that can be either the main db or a transaction
 * Allows repositories to work with both regular and transactional operations
 */
export type DbContext = typeof db | Transaction;

/**
 * Execute a callback within a database transaction
 * Automatically commits on success, rolls back on error
 *
 * If an existing transaction is provided, reuses it instead of creating a new one.
 * This allows functions to optionally participate in an outer transaction.
 *
 * @example
 * // Standalone transaction
 * await withTransaction(async (tx) => {
 *   await userRepository.create(userData, tx);
 *   await logRepository.create(logData, tx);
 * });
 *
 * @example
 * // Reuse existing transaction
 * async function createUserWithLog(data: UserData, tx?: Transaction) {
 *   return withTransaction(async (trx) => {
 *     await userRepository.create(data, trx);
 *     await logRepository.create(logData, trx);
 *   }, tx);
 * }
 */
export async function withTransaction<T>(
  callback: (tx: Transaction) => Promise<T>,
  tx?: Transaction
): Promise<T> {
  if (tx) return callback(tx);
  return db.transaction(callback);
}

/**
 * Get the database context - either uses provided transaction or falls back to db
 * This allows functions to optionally participate in an existing transaction
 *
 * @example
 * async function createUser(data: UserData, tx?: Transaction) {
 *   const ctx = getDbContext(tx);
 *   return ctx.insert(users).values(data);
 * }
 */
export function getDbContext(tx?: Transaction): DbContext {
  return tx ?? db;
}

// ============================================================================
// Time Utilities
// ============================================================================

/**
 * 数据库时间工具函数
 * 统一使用 MySQL 服务端计算时间，避免客户端时区问题
 */

/** 当前时间 (MySQL NOW()) */
export const now = () => sql`NOW()`;

/** 从现在起若干秒后的时间 */
export const addSeconds = (seconds: number) => sql`DATE_ADD(NOW(), INTERVAL ${seconds} SECOND)`;

/** 从现在起若干分钟后的时间 */
export const addMinutes = (minutes: number) => sql`DATE_ADD(NOW(), INTERVAL ${minutes} MINUTE)`;

/** 从现在起若干小时后的时间 */
export const addHours = (hours: number) => sql`DATE_ADD(NOW(), INTERVAL ${hours} HOUR)`;

/** 从现在起若干天后的时间 */
export const addDays = (days: number) => sql`DATE_ADD(NOW(), INTERVAL ${days} DAY)`;

/** 从现在起若干秒前的时间 */
export const subtractSeconds = (seconds: number) =>
  sql`DATE_SUB(NOW(), INTERVAL ${seconds} SECOND)`;
