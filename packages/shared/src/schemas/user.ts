import { z } from 'zod';
import { emailSchema, usernameSchema } from './auth';

// ==================== Field Schemas ====================

export const bioSchema = z
  .string()
  .max(500, 'Bio must be at most 500 characters')
  .nullable()
  .optional();

export const avatarUrlSchema = z
  .string()
  .url('Invalid URL format')
  .max(2048, 'Avatar URL is too long')
  .nullable()
  .optional()
  .or(z.literal(''));

// ==================== Request Schemas ====================

export const updateProfileRequestSchema = z.object({
  username: usernameSchema.optional(),
  bio: bioSchema,
  avatarUrl: avatarUrlSchema,
});

export const changeEmailRequestSchema = z.object({
  newEmail: emailSchema,
  verificationToken: z.string().min(1, 'Verification token is required'),
});

// ==================== Inferred Types ====================

export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type ChangeEmailRequest = z.infer<typeof changeEmailRequestSchema>;
