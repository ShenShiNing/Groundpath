import { env } from './env';

// Email and Verification Configuration
export const EMAIL_CONFIG = {
  // SMTP Configuration
  smtp: {
    host: env.SMTP_HOST ?? 'smtp.example.com',
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE, // true for 465, false for other ports
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  },

  // Email sender info
  from: {
    name: env.EMAIL_FROM_NAME,
    address: env.EMAIL_FROM_ADDRESS,
  },

  // Verification settings
  verification: {
    // Verification token secret (for JWT proving email was verified)
    secret: env.EMAIL_VERIFICATION_SECRET,

    // Code settings
    codeLength: 6,
    codeExpiresInMinutes: 10,
    resendCooldownSeconds: 60,
    maxCodesPerHour: 5,

    // Verification token (proof of verification) expiry
    tokenExpiresInMinutes: 5,
  },
} as const;
