import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Load environment files in order of priority
// process.cwd() returns the directory where the command is run (packages/server)
const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${nodeEnv}.local` });
dotenv.config({ path: `.env.${nodeEnv}` });
dotenv.config({ path: '.env' });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set. Please check your .env files.');
  process.exit(1);
}

export default defineConfig({
  out: './drizzle',
  schema: './src/shared/db/schema/index.ts',
  dialect: 'mysql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
