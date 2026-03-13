// ---------------------------------------------------------------------------
// Chat business defaults
// ---------------------------------------------------------------------------

export const chatDefaults = {
  /** Maximum length for conversation titles */
  titleMaxLength: 50,
  /** Max tokens for AI title generation */
  titleGenMaxTokens: 30,
  /** Temperature for AI title generation (lower = more deterministic) */
  titleGenTemperature: 0.3,
} as const;
