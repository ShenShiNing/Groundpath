import type { User } from '@core/db/schema/user/users.schema';
import type { UserPublicInfo } from '@groundpath/shared/types';
import type { AccessTokenSubject } from '@core/types';
import { storageConfig } from '@config/env';
import { storageProvider } from '@modules/storage';

/**
 * Check if a URL is a local storage URL that needs re-signing
 */
function isLocalStorageUrl(url: string): boolean {
  return url.includes('/api/uploads/') || url.includes('/api/files/');
}

/**
 * Extract storage key from a local storage URL
 */
function extractKeyFromUrl(url: string): string | null {
  const match = url.match(/\/api\/(?:uploads|files)\/([^?]+)/);
  const captured = match?.[1];
  if (!captured) return null;
  try {
    return decodeURIComponent(captured);
  } catch {
    return null;
  }
}

/**
 * Regenerate signed URL for local storage files (avatars)
 * For R2 or external URLs, returns as-is
 */
function regenerateSignedUrl(url: string | null, expiresIn?: number): string | null {
  if (!url) return null;
  if (!isLocalStorageUrl(url)) return url;

  const key = extractKeyFromUrl(url);
  if (!key) return url;

  return storageProvider.getPublicUrl(key, {
    expiresIn: expiresIn ?? storageConfig.signing.avatarUrlExpiresIn,
  });
}

/**
 * Extract public info from User entity
 * Shared mapper used across multiple modules
 */
export function toUserPublicInfo(user: User): UserPublicInfo {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatarUrl: regenerateSignedUrl(user.avatarUrl),
    bio: user.bio,
    status: user.status,
    emailVerified: user.emailVerified,
    hasPassword: !!user.password,
    createdAt: user.createdAt,
  };
}

/**
 * Build access token payload from User entity
 * Shared mapper used by auth and token services
 */
export function buildAccessTokenSubject(user: User): AccessTokenSubject {
  return {
    sub: user.id,
    email: user.email,
    username: user.username,
    status: user.status,
    emailVerified: user.emailVerified,
  };
}
