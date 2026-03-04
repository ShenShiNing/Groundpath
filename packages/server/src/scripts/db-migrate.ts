/**
 * Custom migration script that auto-creates the database if it doesn't exist,
 * then runs Drizzle ORM migrations.
 *
 * Usage: pnpm db:migrate
 */

import path from 'path';
import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';

// Load environment files (same logic as drizzle.config.ts)
const nodeEnv = process.env.NODE_ENV || 'development';
const envDir = path.resolve(import.meta.dirname, '../..');
dotenv.config({ path: path.join(envDir, `.env.${nodeEnv}.local`) });
dotenv.config({ path: path.join(envDir, `.env.${nodeEnv}`) });
dotenv.config({ path: path.join(envDir, '.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL is not set. Please check your .env files.');
  process.exit(1);
}

/**
 * Parse the database name from a MySQL connection URL.
 * Supports: mysql://user:pass@host:port/dbname?params
 */
function parseDatabaseName(url: string): { dbName: string; urlWithoutDb: string } {
  const parsed = new URL(url);
  const dbName = parsed.pathname.slice(1); // remove leading '/'
  if (!dbName) {
    console.error('❌ DATABASE_URL does not contain a database name.');
    process.exit(1);
  }
  // Build URL without the database path
  parsed.pathname = '/';
  return { dbName, urlWithoutDb: parsed.toString() };
}

async function run() {
  const { dbName, urlWithoutDb } = parseDatabaseName(databaseUrl!);

  // Step 1: Connect without database and ensure it exists
  console.log(`🔍 Checking if database "${dbName}" exists...`);
  const tempConnection = await mysql.createConnection({ uri: urlWithoutDb });

  try {
    await tempConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    console.log(`✅ Database "${dbName}" is ready.`);
  } finally {
    await tempConnection.end();
  }

  // Step 2: Connect to the actual database and run migrations
  console.log('🚀 Running migrations...');
  const connection = await mysql.createConnection({ uri: databaseUrl });

  try {
    const db = drizzle({ client: connection });
    await migrate(db, {
      migrationsFolder: path.resolve(import.meta.dirname, '../../drizzle'),
    });
    console.log('✅ Migrations completed successfully.');
  } finally {
    await connection.end();
  }
}

run().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
