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

type AfterTransactionCommitCallback = () => Promise<void> | void;

const afterCommitCallbacks = new WeakMap<object, AfterTransactionCommitCallback[]>();

function getAfterCommitCallbacks(tx: Transaction): AfterTransactionCommitCallback[] | undefined {
  return afterCommitCallbacks.get(tx as object);
}

function createAfterCommitCallbacks(tx: Transaction): AfterTransactionCommitCallback[] {
  const callbacks: AfterTransactionCommitCallback[] = [];
  afterCommitCallbacks.set(tx as object, callbacks);
  return callbacks;
}

async function flushAfterCommitCallbacks(tx: Transaction): Promise<void> {
  const callbacks = getAfterCommitCallbacks(tx);
  afterCommitCallbacks.delete(tx as object);

  if (!callbacks?.length) {
    return;
  }

  const results = await Promise.allSettled(
    callbacks.map((callback) => Promise.resolve().then(callback))
  );
  const rejected = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );

  if (!rejected.length) {
    return;
  }

  if (rejected.length === 1) {
    throw rejected[0].reason;
  }

  throw new AggregateError(
    rejected.map((result) => result.reason),
    `${rejected.length} after-commit callbacks failed`
  );
}

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

  let managedTx: Transaction | undefined;

  const result = await db.transaction(async (trx) => {
    managedTx = trx;
    createAfterCommitCallbacks(trx);

    try {
      return await callback(trx);
    } catch (error) {
      afterCommitCallbacks.delete(trx as object);
      throw error;
    }
  });

  if (managedTx) {
    await flushAfterCommitCallbacks(managedTx);
  }

  return result;
}

/**
 * Register a callback that should run after the surrounding managed transaction commits.
 *
 * If no transaction is provided, or if the transaction was not created via `withTransaction`,
 * the callback executes immediately.
 */
export async function afterTransactionCommit(
  callback: AfterTransactionCommitCallback,
  tx?: Transaction
): Promise<void> {
  if (!tx) {
    await callback();
    return;
  }

  const callbacks = getAfterCommitCallbacks(tx);
  if (!callbacks) {
    await callback();
    return;
  }

  callbacks.push(callback);
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
