import type { User } from '@shared/db/schema/user/users.schema';
import type { UserPublicInfo } from '@knowledge-agent/shared/types';

/**
 * Extract public info from User entity
 * Shared mapper used across multiple modules
 */
export function toUserPublicInfo(user: User): UserPublicInfo {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    status: user.status,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  };
}
