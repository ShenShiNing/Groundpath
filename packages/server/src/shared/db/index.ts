import { drizzle } from 'drizzle-orm/mysql2';
import { env } from '@config/env';
import * as schema from './schema';

export const db = drizzle({
  connection: {
    uri: env.DATABASE_URL,
  },
  schema,
  mode: 'default',
});
