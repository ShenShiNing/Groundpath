import { sql } from 'drizzle-orm';

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
