import { BRAND_CONFIG } from '@groundpath/shared/constants';
import { z } from '@groundpath/shared/schemas';
import { booleanString, csvStringArray } from './helpers';

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  SERVER_TIMEOUT: z.coerce.number().default(30000),
  SERVER_KEEP_ALIVE_TIMEOUT: z.coerce.number().default(65000),
  SHUTDOWN_TIMEOUT: z.coerce.number().default(10000),
  TRUST_PROXY: z.string().optional(),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
});

const databaseSchema = z.object({
  DATABASE_URL: z.string(),
  DB_CONNECTION_LIMIT: z.coerce.number().default(10),
  DB_QUEUE_LIMIT: z.coerce.number().default(0),
  DB_TIMEZONE: z.string().default('+00:00'),
});

const redisSchema = z.object({
  REDIS_URL: z.string().default(''),
  REDIS_PREFIX: z.string().default(BRAND_CONFIG.redisPrefix),
});

const cacheSchema = z.object({
  CACHE_DRIVER: z.enum(['redis', 'memory']).default('redis'),
});

const authSchema = z.object({
  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default(BRAND_CONFIG.jwtIssuer),
  JWT_AUDIENCE: z.string().default(BRAND_CONFIG.jwtAudience),
  ENCRYPTION_KEY: z.string().min(32),
  OAUTH_EXCHANGE_CODE_SECRET: z.string().default(''),
  AUTH_COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),
  AUTH_COOKIE_DOMAIN: z.string().default(''),
});

const emailSchema = z.object({
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: booleanString(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  EMAIL_FROM_NAME: z.string().default(BRAND_CONFIG.emailFromName),
  EMAIL_FROM_ADDRESS: z.string().default('noreply@example.com'),
  EMAIL_VERIFICATION_SECRET: z.string().min(1),
});

const oauthSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z
    .string()
    .default('http://localhost:3000/api/v1/auth/oauth/google/callback'),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_CALLBACK_URL: z
    .string()
    .default('http://localhost:3000/api/v1/auth/oauth/github/callback'),
});

const storageSchema = z.object({
  STORAGE_TYPE: z.enum(['local', 'r2']).optional(),
  LOCAL_STORAGE_PATH: z.string().default('./uploads'),
  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_BUCKET_NAME: z.string().default(''),
  R2_PUBLIC_URL: z.string().default(''),
  FILE_SIGNING_SECRET: z.string().min(32).optional(),
  DISABLE_FILE_SIGNING: booleanString(false),
});

const documentScheduleSchema = z.object({
  DOCUMENT_PROCESSING_RECOVERY_CRON: z.string().default('*/10 * * * *'),
  DOCUMENT_BUILD_CLEANUP_CRON: z.string().default('30 3 * * *'),
  DOCUMENT_BUILD_CLEANUP_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(7),
  DOCUMENT_BUILD_CLEANUP_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
});

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

const vectorSchema = z.object({
  QDRANT_URL: z.string().default('http://localhost:6333'),
  QDRANT_API_KEY: z.string().optional(),
});

const llmSchema = z.object({
  MODEL_FETCH_TIMEOUT: z.coerce.number().default(15000),
});

const queueSchema = z.object({
  QUEUE_DRIVER: z.enum(['bullmq', 'inline']).default('bullmq'),
  QUEUE_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(3),
});

const rateLimitSchema = z.object({
  RATE_LIMIT_DRIVER: z.enum(['redis', 'memory', 'noop']).default('redis'),
});

const coordinationSchema = z.object({
  LOCK_DRIVER: z.enum(['redis', 'memory']).default('redis'),
});

const backfillScheduleSchema = z.object({
  BACKFILL_SCHEDULE_CRON: z.string().default('0 2 * * *'),
});

const vlmSchema = z.object({
  VLM_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  VLM_MODEL: z.string().default('gpt-4o-mini'),
  VLM_API_KEY: z.string().optional(),
  VLM_BASE_URL: z.string().optional(),
});

const agentSchema = z.object({
  TAVILY_API_KEY: z.string().optional(),
});

const loggingSchema = z.object({
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const structuredRagObservabilitySchema = z.object({
  STRUCTURED_RAG_ALERTS_ENABLED: booleanString(false),
  STRUCTURED_RAG_ALERT_EMAIL_TO: csvStringArray(),
  STRUCTURED_RAG_ALERT_SCHEDULE_CRON: z.string().default('0 5 * * *'),
});

const featureFlagsSchema = z.object({
  DISABLE_RATE_LIMIT: booleanString(false),
  COUNTER_SYNC_ENABLED: booleanString(false),
  STRUCTURED_RAG_ENABLED: booleanString(false),
  STRUCTURED_RAG_ROLLOUT_MODE: z.enum(['disabled', 'internal', 'all']).default('disabled'),
  STRUCTURED_RAG_INTERNAL_USER_IDS: csvStringArray(),
  STRUCTURED_RAG_INTERNAL_KB_IDS: csvStringArray(),
  IMAGE_DESCRIPTION_ENABLED: booleanString(false),
  DOCUMENT_PROCESSING_RECOVERY_ENABLED: booleanString(true),
  DOCUMENT_PROCESSING_RECOVERY_REQUEUE_ENABLED: booleanString(true),
  DOCUMENT_BUILD_CLEANUP_ENABLED: booleanString(true),
  LOG_CLEANUP_ENABLED: booleanString(true),
  BACKFILL_SCHEDULE_ENABLED: booleanString(false),
});

export const envSchema = serverSchema
  .extend(databaseSchema.shape)
  .extend(redisSchema.shape)
  .extend(cacheSchema.shape)
  .extend(authSchema.shape)
  .extend(emailSchema.shape)
  .extend(oauthSchema.shape)
  .extend(storageSchema.shape)
  .extend(documentScheduleSchema.shape)
  .extend(queueSchema.shape)
  .extend(rateLimitSchema.shape)
  .extend(coordinationSchema.shape)
  .extend(backfillScheduleSchema.shape)
  .extend(embeddingSchema.shape)
  .extend(vectorSchema.shape)
  .extend(llmSchema.shape)
  .extend(vlmSchema.shape)
  .extend(agentSchema.shape)
  .extend(loggingSchema.shape)
  .extend(structuredRagObservabilitySchema.shape)
  .extend(featureFlagsSchema.shape);

export type Env = z.infer<typeof envSchema>;
