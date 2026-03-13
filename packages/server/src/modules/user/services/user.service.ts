import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import type { UpdateProfileRequest, UserPublicInfo } from '@knowledge-agent/shared/types';
import type { User, NewUser } from '@core/db/schema/user/users.schema';
import type { Transaction } from '@core/db/db.utils';
import { Errors } from '@core/errors';
import { userRepository } from '../repositories/user.repository';
import { toUserPublicInfo } from '@core/utils';

/**
 * User service for profile management and cross-module user operations
 */
export const userService = {
  // ==================== Basic User Operations ====================

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | undefined> {
    return userRepository.findById(id);
  },

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | undefined> {
    return userRepository.findByEmail(email);
  },

  /**
   * Create a new user
   */
  async create(data: NewUser): Promise<User> {
    return userRepository.create(data);
  },

  /**
   * Check if user exists by email
   */
  async existsByEmail(email: string): Promise<boolean> {
    return userRepository.existsByEmail(email);
  },

  /**
   * Check if user exists by username
   */
  async existsByUsername(username: string): Promise<boolean> {
    return userRepository.existsByUsername(username);
  },

  /**
   * Update user's last login information
   */
  async updateLastLogin(userId: string, ipAddress: string | null): Promise<void> {
    return userRepository.updateLastLogin(userId, ipAddress);
  },

  /**
   * Update user's password
   */
  async updatePassword(userId: string, hashedPassword: string, tx?: Transaction): Promise<void> {
    return userRepository.updatePassword(userId, hashedPassword, tx);
  },

  /**
   * Update user profile (internal - direct DB update without validation)
   */
  async updateProfileInternal(
    userId: string,
    data: { username?: string; bio?: string | null; avatarUrl?: string | null }
  ): Promise<User | undefined> {
    return userRepository.updateProfile(userId, data);
  },

  // ==================== Public API ====================

  /**
   * Update user profile (with validation)
   */
  async updateProfile(userId: string, data: UpdateProfileRequest): Promise<UserPublicInfo> {
    // Find user first
    const existingUser = await userRepository.findById(userId);
    if (!existingUser) {
      throw Errors.auth(AUTH_ERROR_CODES.USER_NOT_FOUND, 'User not found', 404);
    }

    // Check username uniqueness if changing
    if (data.username && data.username !== existingUser.username) {
      const usernameExists = await userRepository.existsByUsernameExcludingUser(
        data.username,
        userId
      );
      if (usernameExists) {
        throw Errors.auth(
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
      throw Errors.auth(AUTH_ERROR_CODES.USER_NOT_FOUND, 'User not found', 404);
    }

    return toUserPublicInfo(updatedUser);
  },
};
