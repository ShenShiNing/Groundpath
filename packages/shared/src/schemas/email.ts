import { z } from 'zod';
import { emailSchema, passwordSchema, deviceInfoSchema } from './auth';

// ==================== Email Verification Code Types ====================

export const emailVerificationCodeTypeSchema = z.enum([
  'register',
  'login',
  'reset_password',
  'change_email',
]);

// ==================== Request Schemas ====================

export const sendVerificationCodeRequestSchema = z.object({
  email: emailSchema,
  type: z.enum(['register', 'reset_password', 'change_email']),
});

export const verifyCodeRequestSchema = z.object({
  email: emailSchema,
  code: z
    .string()
    .length(6, 'Verification code must be 6 digits')
    .regex(/^\d{6}$/, 'Verification code must be 6 digits'),
  type: z.enum(['register', 'reset_password', 'change_email']),
});

export const registerWithCodeRequestSchema = z
  .object({
    email: emailSchema,
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(50, 'Username must be at most 50 characters')
      .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
    password: passwordSchema,
    confirmPassword: z.string(),
    verificationToken: z.string().min(1, 'Verification token is required'),
    deviceInfo: deviceInfoSchema.optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const resetPasswordRequestSchema = z
  .object({
    email: emailSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string(),
    verificationToken: z.string().min(1, 'Verification token is required'),
    logoutAllDevices: z.boolean().optional().default(true),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// ==================== Inferred Types ====================

export type EmailVerificationCodeType = z.infer<typeof emailVerificationCodeTypeSchema>;
export type SendVerificationCodeRequest = z.infer<typeof sendVerificationCodeRequestSchema>;
export type VerifyCodeRequest = z.infer<typeof verifyCodeRequestSchema>;
export type RegisterWithCodeRequest = z.infer<typeof registerWithCodeRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
