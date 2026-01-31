import path from 'path';
import dotenv from 'dotenv';
import { z } from '@knowledge-agent/shared/schemas';

// Determine NODE_ENV before loading env files
const nodeEnv = process.env.NODE_ENV || 'development';

// Load environment files in order of priority (dotenv won't override existing vars)
// 1. .env.{NODE_ENV}.local (git-ignored, highest priority)
// 2. .env.{NODE_ENV} (environment-specific)
// 3. .env (base fallback)
const envDir = path.resolve(import.meta.dirname, '../../..');

dotenv.config({ path: path.join(envDir, `.env.${nodeEnv}.local`) });
dotenv.config({ path: path.join(envDir, `.env.${nodeEnv}`) });
dotenv.config({ path: path.join(envDir, '.env') });

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Database
  DATABASE_URL: z.string(),

  // JWT (required in production, defaults for dev/test)
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),

  // Email (optional - SMTP)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  EMAIL_FROM_NAME: z.string().default('Knowledge Agent'),
  EMAIL_FROM_ADDRESS: z.string().default('noreply@example.com'),
  EMAIL_VERIFICATION_SECRET: z.string().min(1),

  // OAuth - Google (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:3000/api/auth/oauth/google/callback'),

  // OAuth - GitHub (optional)
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_CALLBACK_URL: z.string().default('http://localhost:3000/api/auth/oauth/github/callback'),

  // Frontend URL
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  // R2/S3 Storage
  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_BUCKET_NAME: z.string().default(''),
  R2_PUBLIC_URL: z.string().default(''),

  // Storage
  STORAGE_TYPE: z.enum(['local', 'r2']).optional(),
  LOCAL_STORAGE_PATH: z.string().default('./uploads'),

  // Document upload
  MAX_DOCUMENT_SIZE: z.coerce.number().default(22020096), // 21 MiB

  // Rate limiting
  DISABLE_RATE_LIMIT: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Invalid environment variables:');
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
export type Env = z.infer<typeof envSchema>;
