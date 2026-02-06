import crypto from 'crypto';
import { authConfig } from '@config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getKey(): Buffer {
  // Use first 32 bytes of the encryption key (SHA-256 hash if longer)
  const keyStr = authConfig.encryptionKey;
  if (keyStr.length === 32) {
    return Buffer.from(keyStr, 'utf8');
  }
  return crypto.createHash('sha256').update(keyStr).digest();
}

/**
 * Encrypt a string using AES-256-GCM.
 * Returns format: iv:authTag:ciphertext (all base64 encoded)
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt a string encrypted with AES-256-GCM.
 * Expects format: iv:authTag:ciphertext (all base64 encoded)
 */
export function decrypt(encryptedStr: string): string {
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }

  const [ivB64, authTagB64, ciphertextB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64!, 'base64');
  const authTag = Buffer.from(authTagB64!, 'base64');
  const ciphertext = ciphertextB64!;

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Mask an API key, showing only the last 4 characters
 */
export function maskApiKey(key: string): string {
  if (key.length <= 4) return '****';
  return '****' + key.slice(-4);
}

export const encryptionService = {
  encrypt,
  decrypt,
  maskApiKey,
};
