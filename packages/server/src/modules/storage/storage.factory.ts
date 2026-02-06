import { serverConfig, storageConfig } from '@config/env';
import type { StorageProvider } from './storage.types';
import { LocalStorageProvider } from './providers/local.provider';
import { R2StorageProvider } from './providers/r2.provider';

export function createStorageProvider(): StorageProvider {
  const storageType =
    storageConfig.type || (serverConfig.nodeEnv === 'production' ? 'r2' : 'local');

  return storageType === 'r2' ? new R2StorageProvider() : new LocalStorageProvider();
}

export const storageProvider = createStorageProvider();
