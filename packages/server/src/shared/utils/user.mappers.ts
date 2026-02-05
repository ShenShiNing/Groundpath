import type { User } from '@shared/db/schema/user/users.schema';
import type { UserPublicInfo } from '@knowledge-agent/shared/types';
import { env } from '@config/env';
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

  return storageProvider.getPublicUrl(key, { expiresIn: expiresIn ?? env.AVATAR_URL_EXPIRES_IN });
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
    createdAt: user.createdAt,
  };
}
