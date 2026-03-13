import '@config/env/loader';
import { Errors } from '@core/errors/app-error';
import { envDir, nodeEnv } from '@config/env/loader';
import { envSchema } from '@config/env/schema';

const result = envSchema.safeParse(process.env);

if (!result.success) {
  throw Errors.validation('Invalid environment variables', {
    environment: nodeEnv,
    configDir: envDir,
    fieldErrors: result.error.flatten().fieldErrors,
  });
}

export const validatedEnv = result.data;
export const env = validatedEnv;
export type ValidatedEnv = typeof validatedEnv;
