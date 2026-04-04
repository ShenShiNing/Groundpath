import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.join(repoRoot, `.env.${nodeEnv}.local`) });
dotenv.config({ path: path.join(repoRoot, `.env.${nodeEnv}`) });
dotenv.config({ path: path.join(repoRoot, '.env') });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set. Please check the root .env files.');
  process.exit(1);
}

export default defineConfig({
  out: './drizzle',
  schema: './src/core/db/schema/index.ts',
  dialect: 'mysql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
