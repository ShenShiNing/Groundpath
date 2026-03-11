// ---------------------------------------------------------------------------
// Auth token expiry, password hashing, email verification, and storage URL TTLs
// ---------------------------------------------------------------------------

/** JWT / session token lifetimes and bcrypt cost */
export const authDefaults = {
  accessToken: { expiresInSeconds: 900 },
  refreshToken: { expiresInSeconds: 604_800 },
  bcrypt: { saltRounds: 12 },
} as const;

/** Email verification code / token rules */
export const emailVerificationDefaults = {
  codeLength: 6,
  codeExpiresInMinutes: 10,
  resendCooldownSeconds: 60,
  maxCodesPerHour: 5,
  tokenExpiresInMinutes: 5,
} as const;

/** Signed-URL expiration times */
export const storageSigningDefaults = {
  fileUrlExpiresIn: 3_600,
  avatarUrlExpiresIn: 604_800,
} as const;
