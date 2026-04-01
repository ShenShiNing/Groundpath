import fs from 'node:fs';
import path from 'node:path';
import { describe } from 'vitest';

const packageRoot = path.resolve(import.meta.dirname, '../../../');
const developmentEnvPath = path.join(packageRoot, '.env.development.local');
const testEnvPath = path.join(packageRoot, '.env.test.local');

function readEnvFile(filePath: string): Record<string, string> {
  const env: Record<string, string> = {};

  if (!fs.existsSync(filePath)) {
    return env;
  }

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

export function loadRealIntegrationEnv(): Record<string, string> {
  return {
    ...readEnvFile(developmentEnvPath),
    ...readEnvFile(testEnvPath),
  };
}

export function buildRealIntegrationProcessEnv(
  overrides: NodeJS.ProcessEnv = {}
): NodeJS.ProcessEnv {
  return {
    ...loadRealIntegrationEnv(),
    ...process.env,
    RUN_REAL_INTEGRATION: '1',
    ...overrides,
  };
}

export function resolveRealIntegrationEnvValue(
  keys: readonly string[],
  envFromFile: Record<string, string> = loadRealIntegrationEnv()
): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value) {
      return value;
    }
  }

  for (const key of keys) {
    const value = envFromFile[key];
    if (value) {
      return value;
    }
  }

  return undefined;
}

export function shouldRunRealIntegration(flags: string | readonly string[]): boolean {
  const flagList = Array.isArray(flags) ? flags : [flags];
  const envFromFile = loadRealIntegrationEnv();

  if (process.env.RUN_REAL_INTEGRATION === '1' || envFromFile.RUN_REAL_INTEGRATION === '1') {
    return true;
  }

  return flagList.some((flag) => process.env[flag] === '1' || envFromFile[flag] === '1');
}

export function getRealIntegrationDescribe(
  flags: string | readonly string[]
): typeof describe {
  return (shouldRunRealIntegration(flags) ? describe : describe.skip) as typeof describe;
}
