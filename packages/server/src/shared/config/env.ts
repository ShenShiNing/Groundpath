import path from 'path';
import dotenv from 'dotenv';
import { z } from '@knowledge-agent/shared/schemas';

// ==================== Environment Loading ====================

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

envLoaded = true;

// ==================== Schema Definitions ====================

/** Helper for boolean env vars */
const booleanString = (defaultValue: boolean = false) =>
  z
    .string()
    .default(defaultValue ? 'true' : 'false')
    .transform((v) => v === 'true');

// -------------------- Server --------------------
const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  SERVER_TIMEOUT: z.coerce.number().default(30000), // 30s request timeout
  SERVER_KEEP_ALIVE_TIMEOUT: z.coerce.number().default(65000), // 65s keep-alive
  SHUTDOWN_TIMEOUT: z.coerce.number().default(10000), // 10s graceful shutdown
  // Trust proxy for correct IP detection behind reverse proxy
  // See: https://expressjs.com/en/guide/behind-proxies.html
  TRUST_PROXY: z.string().optional(),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
});

// -------------------- Database --------------------
const databaseSchema = z.object({
  DATABASE_URL: z.string(),
  DB_CONNECTION_LIMIT: z.coerce.number().default(10),
  DB_QUEUE_LIMIT: z.coerce.number().default(0),
});

// -------------------- Authentication --------------------
const authSchema = z.object({
  // JWT secrets
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  // Encryption for sensitive data (API keys, etc.)
  ENCRYPTION_KEY: z.string().min(32),
});

// -------------------- Email (SMTP) --------------------
const emailSchema = z.object({
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: booleanString(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  EMAIL_FROM_NAME: z.string().default('Knowledge Agent'),
  EMAIL_FROM_ADDRESS: z.string().default('noreply@example.com'),
  EMAIL_VERIFICATION_SECRET: z.string().min(1),
});

// -------------------- OAuth Providers --------------------
const oauthSchema = z.object({
  // Google
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:3000/api/auth/oauth/google/callback'),
  // GitHub
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_CALLBACK_URL: z.string().default('http://localhost:3000/api/auth/oauth/github/callback'),
});

// -------------------- Storage --------------------
const storageSchema = z.object({
  STORAGE_TYPE: z.enum(['local', 'r2']).optional(),
  LOCAL_STORAGE_PATH: z.string().default('./uploads'),
  // R2/S3 credentials
  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_BUCKET_NAME: z.string().default(''),
  R2_PUBLIC_URL: z.string().default(''),
  // File signing for secure access
  FILE_SIGNING_SECRET: z.string().min(32).optional(), // defaults to ENCRYPTION_KEY
  FILE_URL_EXPIRES_IN: z.coerce.number().default(3600), // 1 hour
  AVATAR_URL_EXPIRES_IN: z.coerce.number().default(604800), // 7 days
  DISABLE_FILE_SIGNING: booleanString(false),
});

// -------------------- Document Processing --------------------
const documentSchema = z.object({
  MAX_DOCUMENT_SIZE: z.coerce.number().default(22020096), // 21 MiB
  // Text content limits (characters)
  TEXT_CONTENT_MAX_LENGTH: z.coerce.number().default(500000), // 500K for editable files
  TEXT_PREVIEW_MAX_LENGTH: z.coerce.number().default(50000), // 50K for PDF/DOCX preview
  // Chunking for RAG
  CHUNK_SIZE: z.coerce.number().default(512),
  CHUNK_OVERLAP: z.coerce.number().default(50),
});

// -------------------- Embedding Providers --------------------
const embeddingSchema = z.object({
  EMBEDDING_PROVIDER: z.enum(['zhipu', 'openai', 'ollama']).default('zhipu'),
  EMBEDDING_CONCURRENCY: z.coerce.number().default(5),
  // Zhipu AI (default)
  ZHIPU_API_KEY: z.string().optional(),
  ZHIPU_EMBEDDING_MODEL: z.string().default('embedding-3'),
  ZHIPU_EMBEDDING_DIMENSIONS: z.coerce.number().default(1024),
  // OpenAI
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  // Ollama (local)
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_EMBEDDING_MODEL: z.string().default('nomic-embed-text'),
});

// -------------------- Vector Database (Qdrant) --------------------
const vectorSchema = z.object({
  QDRANT_URL: z.string().default('http://localhost:6333'),
  QDRANT_API_KEY: z.string().optional(),
});

// -------------------- LLM Providers --------------------
const llmSchema = z.object({
  // Fallback keys when user hasn't configured their own
  ANTHROPIC_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().default('https://api.deepseek.com'),
});

// -------------------- Logging --------------------
const loggingSchema = z.object({
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Retention (days)
  LOG_RETENTION_LOGIN_DAYS: z.coerce.number().int().min(1).default(90),
  LOG_RETENTION_OPERATION_DAYS: z.coerce.number().int().min(1).default(365),
  LOG_RETENTION_SYSTEM_DAYS: z.coerce.number().int().min(1).default(30),
  // Cleanup
  LOG_CLEANUP_BATCH_SIZE: z.coerce.number().int().min(100).default(1000),
  LOG_CLEANUP_ENABLED: booleanString(true),
});

// -------------------- Feature Flags --------------------
const featureFlagsSchema = z.object({
  DISABLE_RATE_LIMIT: booleanString(false),
  COUNTER_SYNC_ENABLED: booleanString(false), // Weekly counter sync for consistency
});

// ==================== Combined Schema ====================

const envSchema = serverSchema
  .extend(databaseSchema.shape)
  .extend(authSchema.shape)
  .extend(emailSchema.shape)
  .extend(oauthSchema.shape)
  .extend(storageSchema.shape)
  .extend(documentSchema.shape)
  .extend(embeddingSchema.shape)
  .extend(vectorSchema.shape)
  .extend(llmSchema.shape)
  .extend(loggingSchema.shape)
  .extend(featureFlagsSchema.shape);

// ==================== Validation & Export ====================

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
