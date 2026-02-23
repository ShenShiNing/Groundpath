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
  SERVER_TIMEOUT: z.coerce.number().default(30000),
  SERVER_KEEP_ALIVE_TIMEOUT: z.coerce.number().default(65000),
  SHUTDOWN_TIMEOUT: z.coerce.number().default(10000),
  TRUST_PROXY: z.string().optional(),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
});

// -------------------- Database --------------------
const databaseSchema = z.object({
  DATABASE_URL: z.string(),
  DB_CONNECTION_LIMIT: z.coerce.number().default(10),
  DB_QUEUE_LIMIT: z.coerce.number().default(0),
});

// -------------------- Redis --------------------
const redisSchema = z.object({
  REDIS_URL: z.string().min(1),
  REDIS_PREFIX: z.string().default('knowledge-agent'),
});

// -------------------- Authentication --------------------
const authSchema = z.object({
  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('knowledge-agent'),
  JWT_AUDIENCE: z.string().default('knowledge-agent-client'),
  ENCRYPTION_KEY: z.string().min(32),
  OAUTH_EXCHANGE_CODE_SECRET: z.string().default(''),
  // Token expiration (in seconds)
  ACCESS_TOKEN_EXPIRES_IN: z.coerce.number().default(900), // 15 minutes
  REFRESH_TOKEN_EXPIRES_IN: z.coerce.number().default(604800), // 7 days
  // Password hashing
  BCRYPT_SALT_ROUNDS: z.coerce.number().min(4).max(31).default(12),
  AUTH_COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),
  AUTH_COOKIE_DOMAIN: z.string().default(''),
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
  // Email verification settings
  EMAIL_CODE_LENGTH: z.coerce.number().min(4).max(10).default(6),
  EMAIL_CODE_EXPIRES_MINUTES: z.coerce.number().min(1).default(10),
  EMAIL_RESEND_COOLDOWN_SECONDS: z.coerce.number().min(10).default(60),
  EMAIL_MAX_CODES_PER_HOUR: z.coerce.number().min(1).default(5),
  EMAIL_VERIFICATION_TOKEN_EXPIRES_MINUTES: z.coerce.number().min(1).default(5),
});

// -------------------- OAuth Providers --------------------
const oauthSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:3000/api/auth/oauth/google/callback'),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_CALLBACK_URL: z.string().default('http://localhost:3000/api/auth/oauth/github/callback'),
  OAUTH_STATE_SECRET: z.string().default(''),
});

// -------------------- Storage --------------------
const storageSchema = z.object({
  STORAGE_TYPE: z.enum(['local', 'r2']).optional(),
  LOCAL_STORAGE_PATH: z.string().default('./uploads'),
  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_BUCKET_NAME: z.string().default(''),
  R2_PUBLIC_URL: z.string().default(''),
  FILE_SIGNING_SECRET: z.string().min(32).optional(),
  FILE_URL_EXPIRES_IN: z.coerce.number().default(3600),
  AVATAR_URL_EXPIRES_IN: z.coerce.number().default(604800),
  DISABLE_FILE_SIGNING: booleanString(false),
});

// -------------------- Document Processing --------------------
const documentSchema = z.object({
  MAX_DOCUMENT_SIZE: z.coerce.number().default(22020096),
  TEXT_CONTENT_MAX_LENGTH: z.coerce.number().default(500000),
  TEXT_PREVIEW_MAX_LENGTH: z.coerce.number().default(50000),
  CHUNK_SIZE: z.coerce.number().default(512),
  CHUNK_OVERLAP: z.coerce.number().default(50),
});

// -------------------- Embedding Providers --------------------
const embeddingSchema = z.object({
  EMBEDDING_PROVIDER: z.enum(['zhipu', 'openai', 'ollama']).default('zhipu'),
  EMBEDDING_CONCURRENCY: z.coerce.number().default(5),
  ZHIPU_API_KEY: z.string().optional(),
  ZHIPU_EMBEDDING_MODEL: z.string().default('embedding-3'),
  ZHIPU_EMBEDDING_DIMENSIONS: z.coerce.number().default(1024),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
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
  ANTHROPIC_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().default('https://api.deepseek.com'),
});

// -------------------- Logging --------------------
const loggingSchema = z.object({
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_RETENTION_LOGIN_DAYS: z.coerce.number().int().min(1).default(90),
  LOG_RETENTION_OPERATION_DAYS: z.coerce.number().int().min(1).default(365),
  LOG_RETENTION_SYSTEM_DAYS: z.coerce.number().int().min(1).default(30),
  LOG_CLEANUP_BATCH_SIZE: z.coerce.number().int().min(100).default(1000),
  LOG_CLEANUP_ENABLED: booleanString(true),
});

// -------------------- Feature Flags --------------------
const featureFlagsSchema = z.object({
  DISABLE_RATE_LIMIT: booleanString(false),
  COUNTER_SYNC_ENABLED: booleanString(false),
});

// ==================== Combined Schema ====================

const envSchema = serverSchema
  .extend(databaseSchema.shape)
  .extend(redisSchema.shape)
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

// ==================== Validation ====================

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment variables:');
  console.error('  Environment: %s', nodeEnv);
  console.error('  Config dir: %s', envDir);
  console.error('  Errors:', JSON.stringify(result.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

const validatedEnv = result.data;

// ==================== Modular Config Exports ====================

/** Raw environment variables (use specific configs below when possible) */
export const env = validatedEnv;
export type Env = z.infer<typeof envSchema>;

/** Server configuration */
export const serverConfig = {
  nodeEnv: validatedEnv.NODE_ENV,
  port: validatedEnv.PORT,
  timeout: validatedEnv.SERVER_TIMEOUT,
  keepAliveTimeout: validatedEnv.SERVER_KEEP_ALIVE_TIMEOUT,
  shutdownTimeout: validatedEnv.SHUTDOWN_TIMEOUT,
  trustProxy: validatedEnv.TRUST_PROXY,
  frontendUrl: validatedEnv.FRONTEND_URL,
} as const;

/** Database configuration */
export const databaseConfig = {
  url: validatedEnv.DATABASE_URL,
  connectionLimit: validatedEnv.DB_CONNECTION_LIMIT,
  queueLimit: validatedEnv.DB_QUEUE_LIMIT,
} as const;

/** Redis configuration */
export const redisConfig = {
  url: validatedEnv.REDIS_URL,
  prefix: validatedEnv.REDIS_PREFIX,
} as const;

/** Authentication configuration */
export const authConfig = {
  jwt: {
    secret: validatedEnv.JWT_SECRET,
    issuer: validatedEnv.JWT_ISSUER,
    audience: validatedEnv.JWT_AUDIENCE,
  },
  accessToken: {
    expiresInSeconds: validatedEnv.ACCESS_TOKEN_EXPIRES_IN,
  },
  refreshToken: {
    expiresInSeconds: validatedEnv.REFRESH_TOKEN_EXPIRES_IN,
  },
  bcrypt: {
    saltRounds: validatedEnv.BCRYPT_SALT_ROUNDS,
  },
  encryptionKey: validatedEnv.ENCRYPTION_KEY,
  tokenHashing: {
    refreshTokenSecret: validatedEnv.ENCRYPTION_KEY,
    oauthExchangeCodeSecret: validatedEnv.OAUTH_EXCHANGE_CODE_SECRET || validatedEnv.ENCRYPTION_KEY,
  },
  cookie: {
    sameSite: validatedEnv.AUTH_COOKIE_SAMESITE,
    domain: validatedEnv.AUTH_COOKIE_DOMAIN || undefined,
  },
} as const;

/** Email (SMTP) configuration */
export const emailConfig = {
  smtp: {
    host: validatedEnv.SMTP_HOST ?? 'smtp.example.com',
    port: validatedEnv.SMTP_PORT,
    secure: validatedEnv.SMTP_SECURE,
    auth: {
      user: validatedEnv.SMTP_USER,
      pass: validatedEnv.SMTP_PASS,
    },
  },
  from: {
    name: validatedEnv.EMAIL_FROM_NAME,
    address: validatedEnv.EMAIL_FROM_ADDRESS,
  },
  verification: {
    secret: validatedEnv.EMAIL_VERIFICATION_SECRET,
    codeLength: validatedEnv.EMAIL_CODE_LENGTH,
    codeExpiresInMinutes: validatedEnv.EMAIL_CODE_EXPIRES_MINUTES,
    resendCooldownSeconds: validatedEnv.EMAIL_RESEND_COOLDOWN_SECONDS,
    maxCodesPerHour: validatedEnv.EMAIL_MAX_CODES_PER_HOUR,
    tokenExpiresInMinutes: validatedEnv.EMAIL_VERIFICATION_TOKEN_EXPIRES_MINUTES,
  },
} as const;

/** OAuth providers configuration */
export const oauthConfig = {
  google: {
    clientId: validatedEnv.GOOGLE_CLIENT_ID,
    clientSecret: validatedEnv.GOOGLE_CLIENT_SECRET,
    callbackUrl: validatedEnv.GOOGLE_CALLBACK_URL,
  },
  github: {
    clientId: validatedEnv.GITHUB_CLIENT_ID,
    clientSecret: validatedEnv.GITHUB_CLIENT_SECRET,
    callbackUrl: validatedEnv.GITHUB_CALLBACK_URL,
  },
  stateSecret: validatedEnv.OAUTH_STATE_SECRET || validatedEnv.ENCRYPTION_KEY,
} as const;

/** Storage configuration */
export const storageConfig = {
  type: validatedEnv.STORAGE_TYPE,
  localPath: validatedEnv.LOCAL_STORAGE_PATH,
  r2: {
    accountId: validatedEnv.R2_ACCOUNT_ID,
    accessKeyId: validatedEnv.R2_ACCESS_KEY_ID,
    secretAccessKey: validatedEnv.R2_SECRET_ACCESS_KEY,
    bucketName: validatedEnv.R2_BUCKET_NAME,
    publicUrl: validatedEnv.R2_PUBLIC_URL,
  },
  signing: {
    secret: validatedEnv.FILE_SIGNING_SECRET ?? validatedEnv.ENCRYPTION_KEY,
    fileUrlExpiresIn: validatedEnv.FILE_URL_EXPIRES_IN,
    avatarUrlExpiresIn: validatedEnv.AVATAR_URL_EXPIRES_IN,
    disabled: validatedEnv.DISABLE_FILE_SIGNING,
  },
} as const;

/** Document processing configuration */
export const documentConfig = {
  maxSize: validatedEnv.MAX_DOCUMENT_SIZE,
  textContentMaxLength: validatedEnv.TEXT_CONTENT_MAX_LENGTH,
  textPreviewMaxLength: validatedEnv.TEXT_PREVIEW_MAX_LENGTH,
  chunkSize: validatedEnv.CHUNK_SIZE,
  chunkOverlap: validatedEnv.CHUNK_OVERLAP,
} as const;

/** Embedding providers configuration */
export const embeddingConfig = {
  provider: validatedEnv.EMBEDDING_PROVIDER,
  concurrency: validatedEnv.EMBEDDING_CONCURRENCY,
  zhipu: {
    apiKey: validatedEnv.ZHIPU_API_KEY,
    model: validatedEnv.ZHIPU_EMBEDDING_MODEL,
    dimensions: validatedEnv.ZHIPU_EMBEDDING_DIMENSIONS,
  },
  openai: {
    apiKey: validatedEnv.OPENAI_API_KEY,
    model: validatedEnv.OPENAI_EMBEDDING_MODEL,
  },
  ollama: {
    baseUrl: validatedEnv.OLLAMA_BASE_URL,
    model: validatedEnv.OLLAMA_EMBEDDING_MODEL,
  },
} as const;

/** Vector database (Qdrant) configuration */
export const vectorConfig = {
  url: validatedEnv.QDRANT_URL,
  apiKey: validatedEnv.QDRANT_API_KEY,
} as const;

/** LLM providers configuration */
export const llmConfig = {
  anthropicApiKey: validatedEnv.ANTHROPIC_API_KEY,
  deepseek: {
    apiKey: validatedEnv.DEEPSEEK_API_KEY,
    baseUrl: validatedEnv.DEEPSEEK_BASE_URL,
  },
} as const;

/** Logging configuration */
export const loggingConfig = {
  level: validatedEnv.LOG_LEVEL,
  retention: {
    loginDays: validatedEnv.LOG_RETENTION_LOGIN_DAYS,
    operationDays: validatedEnv.LOG_RETENTION_OPERATION_DAYS,
    systemDays: validatedEnv.LOG_RETENTION_SYSTEM_DAYS,
  },
  cleanup: {
    batchSize: validatedEnv.LOG_CLEANUP_BATCH_SIZE,
    enabled: validatedEnv.LOG_CLEANUP_ENABLED,
  },
} as const;

/** Feature flags */
export const featureFlags = {
  disableRateLimit: validatedEnv.DISABLE_RATE_LIMIT,
  counterSyncEnabled: validatedEnv.COUNTER_SYNC_ENABLED,
} as const;

// ==================== Utilities ====================

/**
 * Check if environment has been loaded via dotenv.
 * Useful for CLI scripts to verify env initialization.
 */
export function isEnvLoaded(): boolean {
  return envLoaded;
}
