import {
  agentDefaults,
  authDefaults,
  backfillDefaults,
  chatDefaults,
  documentAIDefaults,
  documentDefaults,
  documentIndexDefaults,
  emailVerificationDefaults,
  externalServiceDefaults,
  healthDefaults,
  loggingDefaults,
  queueDefaults,
  ragDefaults,
  storageSigningDefaults,
  structuredRagObservabilityDefaults,
  vectorDefaults,
  vlmDefaults,
} from '../defaults';
import { validatedEnv } from './validated-env';

export const serverConfig = {
  nodeEnv: validatedEnv.NODE_ENV,
  port: validatedEnv.PORT,
  timeout: validatedEnv.SERVER_TIMEOUT,
  keepAliveTimeout: validatedEnv.SERVER_KEEP_ALIVE_TIMEOUT,
  shutdownTimeout: validatedEnv.SHUTDOWN_TIMEOUT,
  trustProxy: validatedEnv.TRUST_PROXY,
  frontendUrl: validatedEnv.FRONTEND_URL,
} as const;

export const databaseConfig = {
  url: validatedEnv.DATABASE_URL,
  connectionLimit: validatedEnv.DB_CONNECTION_LIMIT,
  queueLimit: validatedEnv.DB_QUEUE_LIMIT,
  timezone: validatedEnv.DB_TIMEZONE,
} as const;

export const redisConfig = {
  url: validatedEnv.REDIS_URL,
  prefix: validatedEnv.REDIS_PREFIX,
} as const;

export const cacheConfig = {
  driver: validatedEnv.CACHE_DRIVER,
} as const;

export const authConfig = {
  jwt: {
    secret: validatedEnv.JWT_SECRET,
    issuer: validatedEnv.JWT_ISSUER,
    audience: validatedEnv.JWT_AUDIENCE,
  },
  accessToken: authDefaults.accessToken,
  refreshToken: authDefaults.refreshToken,
  bcrypt: authDefaults.bcrypt,
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
    ...emailVerificationDefaults,
  },
} as const;

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
} as const;

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
    ...storageSigningDefaults,
    disabled: validatedEnv.DISABLE_FILE_SIGNING,
  },
} as const;

export const documentConfig = {
  ...documentDefaults,
  processingRecoveryEnabled: validatedEnv.DOCUMENT_PROCESSING_RECOVERY_ENABLED,
  processingRecoveryRequeueEnabled: validatedEnv.DOCUMENT_PROCESSING_RECOVERY_REQUEUE_ENABLED,
  processingRecoveryCron: validatedEnv.DOCUMENT_PROCESSING_RECOVERY_CRON,
  buildCleanupEnabled: validatedEnv.DOCUMENT_BUILD_CLEANUP_ENABLED,
  buildCleanupCron: validatedEnv.DOCUMENT_BUILD_CLEANUP_CRON,
  buildCleanupRetentionDays: validatedEnv.DOCUMENT_BUILD_CLEANUP_RETENTION_DAYS,
  buildCleanupBatchSize: validatedEnv.DOCUMENT_BUILD_CLEANUP_BATCH_SIZE,
} as const;

export const documentIndexConfig = { ...documentIndexDefaults } as const;

export const ragConfig = { ...ragDefaults } as const;

export const documentAIConfig = { ...documentAIDefaults } as const;

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

export const vectorConfig = {
  ...vectorDefaults,
  url: validatedEnv.QDRANT_URL,
  apiKey: validatedEnv.QDRANT_API_KEY,
} as const;

export const llmConfig = {
  modelFetchTimeout: validatedEnv.MODEL_FETCH_TIMEOUT,
} as const;

export const externalServiceConfig = {
  llm: externalServiceDefaults.llm,
  embedding: externalServiceDefaults.embedding,
  storage: externalServiceDefaults.storage,
  webSearch: externalServiceDefaults.webSearch,
  modelFetch: {
    ...externalServiceDefaults.modelFetch,
    timeoutMs: validatedEnv.MODEL_FETCH_TIMEOUT,
  },
  vlm: externalServiceDefaults.vlm,
} as const;

export const agentConfig = {
  ...agentDefaults,
  tavilyApiKey: validatedEnv.TAVILY_API_KEY,
} as const;

export const chatConfig = { ...chatDefaults } as const;

export const vlmConfig = {
  ...vlmDefaults,
  provider: validatedEnv.VLM_PROVIDER,
  model: validatedEnv.VLM_MODEL,
  apiKey: validatedEnv.VLM_API_KEY,
  baseUrl: validatedEnv.VLM_BASE_URL,
} as const;

export const queueConfig = {
  ...queueDefaults,
  driver: validatedEnv.QUEUE_DRIVER,
  concurrency: validatedEnv.QUEUE_CONCURRENCY,
} as const;

export const rateLimitConfig = {
  driver: validatedEnv.RATE_LIMIT_DRIVER,
} as const;

export const coordinationConfig = {
  driver: validatedEnv.LOCK_DRIVER,
} as const;

export const healthConfig = {
  ...healthDefaults,
} as const;

export const backfillConfig = { ...backfillDefaults } as const;

export const backfillScheduleConfig = {
  enabled: validatedEnv.BACKFILL_SCHEDULE_ENABLED,
  cron: validatedEnv.BACKFILL_SCHEDULE_CRON,
} as const;

export const loggingConfig = {
  level: validatedEnv.LOG_LEVEL,
  retention: loggingDefaults.retention,
  cleanup: {
    ...loggingDefaults.cleanup,
    enabled: validatedEnv.LOG_CLEANUP_ENABLED,
  },
  partitioning: loggingDefaults.partitioning,
  redaction: {
    ...loggingDefaults.redaction,
    fingerprintSalt: validatedEnv.LOG_REDACTION_SALT || validatedEnv.ENCRYPTION_KEY,
  },
} as const;

export const structuredRagObservabilityConfig = {
  ...structuredRagObservabilityDefaults,
  alertsEnabled: validatedEnv.STRUCTURED_RAG_ALERTS_ENABLED,
  alertEmailTo: validatedEnv.STRUCTURED_RAG_ALERT_EMAIL_TO,
  alertScheduleCron: validatedEnv.STRUCTURED_RAG_ALERT_SCHEDULE_CRON,
} as const;

export const featureFlags = {
  disableRateLimit: validatedEnv.DISABLE_RATE_LIMIT,
  counterSyncEnabled: validatedEnv.COUNTER_SYNC_ENABLED,
  structuredRagEnabled: validatedEnv.STRUCTURED_RAG_ENABLED,
  structuredRagRolloutMode: validatedEnv.STRUCTURED_RAG_ROLLOUT_MODE,
  structuredRagInternalUserIds: validatedEnv.STRUCTURED_RAG_INTERNAL_USER_IDS,
  structuredRagInternalKnowledgeBaseIds: validatedEnv.STRUCTURED_RAG_INTERNAL_KB_IDS,
  imageDescriptionEnabled: validatedEnv.IMAGE_DESCRIPTION_ENABLED,
} as const;
