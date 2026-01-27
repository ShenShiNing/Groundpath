import { z } from 'zod';

// ==================== Device Info ====================

export const deviceInfoSchema = z.object({
  userAgent: z.string().optional(),
  deviceType: z.string().optional(),
  os: z.string().optional(),
  browser: z.string().optional(),
});

// ==================== Request Schemas ====================

export const loginRequestSchema = z.object({
  email: z.email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  deviceInfo: deviceInfoSchema.optional(),
});

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ==================== Inferred Types ====================

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export type DeviceInfo = z.infer<typeof deviceInfoSchema>;
