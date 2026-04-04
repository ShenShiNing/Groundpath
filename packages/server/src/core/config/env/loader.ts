import path from 'path';
import dotenv from 'dotenv';

let envLoaded = false;

const nodeEnv = process.env.NODE_ENV || 'development';
const envDir = path.resolve(import.meta.dirname, '../../../../../..');

dotenv.config({ path: path.join(envDir, `.env.${nodeEnv}.local`) });
dotenv.config({ path: path.join(envDir, `.env.${nodeEnv}`) });
dotenv.config({ path: path.join(envDir, '.env') });

envLoaded = true;

export { envDir, nodeEnv };

export function isEnvLoaded(): boolean {
  return envLoaded;
}
