import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import type { UpdateProfileRequest, UserPublicInfo } from '@knowledge-agent/shared/types';
import { AuthError } from '../utils/errors';
import { userRepository } from '../repositories/userRepository';
import { toUserPublicInfo } from '../types/authTypes';

/**
 * User service for profile management
 */
export const userService = {
  /**
   * Update user profile
   */
  async updateProfile(userId: string, data: UpdateProfileRequest): Promise<UserPublicInfo> {
    // Find user first
    const existingUser = await userRepository.findById(userId);
    if (!existingUser) {
      throw new AuthError(AUTH_ERROR_CODES.USER_NOT_FOUND, 'User not found', 404);
    }

    // Check username uniqueness if changing
    if (data.username && data.username !== existingUser.username) {
      const usernameExists = await userRepository.existsByUsernameExcludingUser(
        data.username,
        userId
      );
      if (usernameExists) {
        throw new AuthError(
          AUTH_ERROR_CODES.USERNAME_ALREADY_EXISTS,
          'This username is already taken',
          400
        );
      }
    }

    // Normalize avatarUrl - empty string becomes null
    const avatarUrl = data.avatarUrl === '' ? null : data.avatarUrl;

    // Update profile
    const updatedUser = await userRepository.updateProfile(userId, {
      ...(data.username && { username: data.username }),
      ...(data.bio !== undefined && { bio: data.bio }),
      ...(avatarUrl !== undefined && { avatarUrl }),
    });

    if (!updatedUser) {
      throw new AuthError(AUTH_ERROR_CODES.USER_NOT_FOUND, 'User not found', 404);
    }

    return toUserPublicInfo(updatedUser);
  },
};
