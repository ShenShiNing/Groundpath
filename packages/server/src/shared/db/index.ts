import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { env } from '@config/env';
import * as schema from './schema';

// Create connection pool with proper configuration
const poolConnection = mysql.createPool({
  uri: env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: env.DB_CONNECTION_LIMIT,
  queueLimit: env.DB_QUEUE_LIMIT,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

export const db = drizzle({
  client: poolConnection,
  schema,
  mode: 'default',
});

/**
 * Close database connection pool.
 * Should be called during graceful shutdown.
 */
export async function closeDatabase(): Promise<void> {
  await poolConnection.end();
}
