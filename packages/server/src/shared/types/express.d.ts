/**
 * Express Request/Response type augmentations
 *
 * This file extends Express types with custom properties used throughout the app.
 * It must be imported somewhere in the app for the augmentation to take effect.
 *
 * @see https://www.typescriptlang.org/docs/handbook/declaration-merging.html#module-augmentation
 */

import type { Logger } from 'pino';
import type { AccessTokenPayload, RefreshTokenContext } from './auth.types';

declare module 'express' {
  interface Request {
    /** User info from verified access token */
    user?: AccessTokenPayload;
    /** Context from verified refresh token */
    refreshContext?: RefreshTokenContext;
    /** Request-scoped logger with requestId */
    log: Logger;
  }

  interface Locals {
    /** Validated request data from Zod schemas */
    validated?: {
      body?: unknown;
      query?: unknown;
      params?: unknown;
    };
  }
}
