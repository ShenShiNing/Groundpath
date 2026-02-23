import crypto from 'crypto';
import { authConfig } from '@config/env';

/**
 * Hash OAuth exchange code for one-way storage and lookup.
 */
export function hashOAuthExchangeCode(code: string): string {
  return crypto
    .createHmac('sha256', authConfig.tokenHashing.oauthExchangeCodeSecret)
    .update(code)
    .digest('hex');
}
