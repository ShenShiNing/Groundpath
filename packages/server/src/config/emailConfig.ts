// Email and Verification Configuration
export const EMAIL_CONFIG = {
  // SMTP Configuration
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  },

  // Email sender info
  from: {
    name: process.env.EMAIL_FROM_NAME || 'Knowledge Agent',
    address: process.env.EMAIL_FROM_ADDRESS || 'noreply@example.com',
  },

  // Verification settings
  verification: {
    // Verification token secret (for JWT proving email was verified)
    secret: process.env.EMAIL_VERIFICATION_SECRET || 'dev-verification-secret-change-in-production',

    // Code settings
    codeLength: 6,
    codeExpiresInMinutes: 10,
    resendCooldownSeconds: 60,
    maxCodesPerHour: 5,

    // Verification token (proof of verification) expiry
    tokenExpiresInMinutes: 5,
  },
} as const;
