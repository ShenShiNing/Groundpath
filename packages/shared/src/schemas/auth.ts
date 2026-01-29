import { z } from 'zod';

// ==================== Device Info ====================

export const deviceInfoSchema = z.object({
  userAgent: z.string().optional(),
  deviceType: z.string().optional(),
  os: z.string().optional(),
  browser: z.string().optional(),
});

// ==================== Field Schemas (for client-side validation) ====================

export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(50, 'Username must be at most 50 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores');

export const emailSchema = z.email('Invalid email format');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// ==================== Request Schemas ====================

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  deviceInfo: deviceInfoSchema.optional(),
});

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const registerRequestSchema = z
  .object({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    deviceInfo: deviceInfoSchema.optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const changePasswordRequestSchema = z
  .object({
    oldPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// ==================== Inferred Types ====================

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export type DeviceInfo = z.infer<typeof deviceInfoSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
