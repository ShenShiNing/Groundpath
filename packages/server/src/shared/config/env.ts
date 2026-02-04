import path from 'path';
import dotenv from 'dotenv';
import { z } from '@knowledge-agent/shared/schemas';

// Track if environment has been loaded (for CLI scripts)
let envLoaded = false;

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

// Mark as loaded after dotenv.config calls
envLoaded = true;

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

  // Embedding Provider
  EMBEDDING_PROVIDER: z.enum(['zhipu', 'openai', 'ollama']).default('zhipu'),

  // 智谱 (default)
  ZHIPU_API_KEY: z.string().optional(),
  ZHIPU_EMBEDDING_MODEL: z.string().default('embedding-3'),
  ZHIPU_EMBEDDING_DIMENSIONS: z.coerce.number().default(1024),

  // OpenAI (alternative)
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

  // Ollama (local)
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_EMBEDDING_MODEL: z.string().default('nomic-embed-text'),

  // Qdrant
  QDRANT_URL: z.string().default('http://localhost:6333'),
  QDRANT_API_KEY: z.string().optional(),
  // DEPRECATED: Collections are now named dynamically per knowledge base
  // Format: embedding_{provider}_{dimensions} (e.g., embedding_zhipu_1024)
  // Kept for reference only - not used in new code
  QDRANT_COLLECTION_NAME: z.string().default('document_chunks'),

  // Chunking
  CHUNK_SIZE: z.coerce.number().default(512),
  CHUNK_OVERLAP: z.coerce.number().default(50),

  // Encryption (for API keys)
  ENCRYPTION_KEY: z.string().min(32),

  // LLM Providers (used as fallback when user hasn't configured their own)
  ANTHROPIC_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().default('https://api.deepseek.com'),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Log retention (days)
  LOG_RETENTION_LOGIN_DAYS: z.coerce.number().int().min(1).default(90),
  LOG_RETENTION_OPERATION_DAYS: z.coerce.number().int().min(1).default(365),
  LOG_RETENTION_SYSTEM_DAYS: z.coerce.number().int().min(1).default(30),

  // Log cleanup
  LOG_CLEANUP_BATCH_SIZE: z.coerce.number().int().min(100).default(1000),
  LOG_CLEANUP_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  // Counter sync (optional weekly sync for data consistency)
  COUNTER_SYNC_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment variables:');
  console.error('  Environment: %s', nodeEnv);
  console.error('  Config dir: %s', envDir);
  console.error('  Errors:', JSON.stringify(result.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = result.data;
export type Env = z.infer<typeof envSchema>;

/**
 * Check if environment has been loaded via dotenv.
 * Useful for CLI scripts to verify env initialization.
 */
export function isEnvLoaded(): boolean {
  return envLoaded;
}
