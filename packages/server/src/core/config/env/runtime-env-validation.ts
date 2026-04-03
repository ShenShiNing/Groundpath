import type { Env } from './schema';
import { getRedisRequirementReasons } from './infra-drivers';

type FieldErrors = Record<string, string[]>;

const productionPlaceholderSecrets: Partial<Record<keyof Env, string[]>> = {
  JWT_SECRET: [
    'change-this-jwt-secret-at-least-32-characters',
    'your-jwt-secret-at-least-32-characters-long',
  ],
  ENCRYPTION_KEY: [
    'change-this-encryption-key-at-least-32',
    'your-32-character-encryption-key-here',
  ],
  EMAIL_VERIFICATION_SECRET: [
    'change-this-email-secret',
    'your-verification-secret-change-in-production',
  ],
};

function addFieldError(fieldErrors: FieldErrors, field: string, message: string): void {
  const existing = fieldErrors[field] ?? [];
  existing.push(message);
  fieldErrors[field] = existing;
}

function isBlank(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

function validateProductionSecrets(env: Env, fieldErrors: FieldErrors): void {
  if (env.NODE_ENV !== 'production') return;

  for (const [field, insecureValues] of Object.entries(productionPlaceholderSecrets)) {
    const value = env[field as keyof Env];
    if (typeof value === 'string' && insecureValues?.includes(value)) {
      addFieldError(
        fieldErrors,
        field,
        `${field} must be replaced with a unique production secret.`
      );
    }
  }
}

function validateEmbeddingConfig(env: Env, fieldErrors: FieldErrors): void {
  if (env.NODE_ENV !== 'production') return;

  if (env.EMBEDDING_PROVIDER === 'zhipu' && isBlank(env.ZHIPU_API_KEY)) {
    addFieldError(
      fieldErrors,
      'ZHIPU_API_KEY',
      'ZHIPU_API_KEY is required when EMBEDDING_PROVIDER=zhipu.'
    );
  }

  if (env.EMBEDDING_PROVIDER === 'openai' && isBlank(env.OPENAI_API_KEY)) {
    addFieldError(
      fieldErrors,
      'OPENAI_API_KEY',
      'OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai.'
    );
  }
}

function validateVlmConfig(env: Env, fieldErrors: FieldErrors): void {
  if (env.IMAGE_DESCRIPTION_ENABLED && isBlank(env.VLM_API_KEY)) {
    addFieldError(
      fieldErrors,
      'VLM_API_KEY',
      'VLM_API_KEY is required when IMAGE_DESCRIPTION_ENABLED=true.'
    );
  }
}

function validateStorageConfig(env: Env, fieldErrors: FieldErrors): void {
  const resolvedStorageType = env.STORAGE_TYPE ?? (env.NODE_ENV === 'production' ? 'r2' : 'local');
  if (resolvedStorageType !== 'r2') return;

  const requiredR2Fields: Array<keyof Env> = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_URL',
  ];

  for (const field of requiredR2Fields) {
    const value = env[field];
    if (typeof value === 'string' && isBlank(value)) {
      addFieldError(fieldErrors, field, `${field} is required when STORAGE_TYPE=r2.`);
    }
  }
}

function validateOAuthProviderConfig(
  fieldErrors: FieldErrors,
  providerName: 'Google' | 'GitHub',
  clientId: string | undefined,
  clientSecret: string | undefined,
  clientIdField: keyof Env,
  clientSecretField: keyof Env
): void {
  const hasClientId = !isBlank(clientId);
  const hasClientSecret = !isBlank(clientSecret);

  if (!hasClientId && !hasClientSecret) {
    return;
  }

  if (!hasClientId) {
    addFieldError(
      fieldErrors,
      clientIdField,
      `${String(clientIdField)} is required when ${String(clientSecretField)} is set for ${providerName} OAuth.`
    );
  }

  if (!hasClientSecret) {
    addFieldError(
      fieldErrors,
      clientSecretField,
      `${String(clientSecretField)} is required when ${String(clientIdField)} is set for ${providerName} OAuth.`
    );
  }
}

function validateOAuthConfig(env: Env, fieldErrors: FieldErrors): void {
  validateOAuthProviderConfig(
    fieldErrors,
    'Google',
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET'
  );
  validateOAuthProviderConfig(
    fieldErrors,
    'GitHub',
    env.GITHUB_CLIENT_ID,
    env.GITHUB_CLIENT_SECRET,
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET'
  );
}

function validateRedisConfig(env: Env, fieldErrors: FieldErrors): void {
  const redisRequirementReasons = getRedisRequirementReasons({
    CACHE_DRIVER: env.CACHE_DRIVER,
    QUEUE_DRIVER: env.QUEUE_DRIVER,
    RATE_LIMIT_DRIVER: env.RATE_LIMIT_DRIVER,
    LOCK_DRIVER: env.LOCK_DRIVER,
    DISABLE_RATE_LIMIT: env.DISABLE_RATE_LIMIT,
  });

  if (redisRequirementReasons.length === 0) {
    return;
  }

  if (!isBlank(env.REDIS_URL)) {
    return;
  }

  addFieldError(
    fieldErrors,
    'REDIS_URL',
    `REDIS_URL is required when ${redisRequirementReasons.join(', ')}.`
  );
}

export function getRuntimeEnvFieldErrors(env: Env): FieldErrors {
  const fieldErrors: FieldErrors = {};

  validateProductionSecrets(env, fieldErrors);
  validateEmbeddingConfig(env, fieldErrors);
  validateVlmConfig(env, fieldErrors);
  validateStorageConfig(env, fieldErrors);
  validateOAuthConfig(env, fieldErrors);
  validateRedisConfig(env, fieldErrors);

  return fieldErrors;
}
