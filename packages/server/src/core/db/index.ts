import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { databaseConfig } from '@config/env';
import * as schema from './schema';

// Create connection pool with proper configuration
const poolConnection = mysql.createPool({
  uri: databaseConfig.url,
  waitForConnections: true,
  connectionLimit: databaseConfig.connectionLimit,
  queueLimit: databaseConfig.queueLimit,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  timezone: databaseConfig.timezone,
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
