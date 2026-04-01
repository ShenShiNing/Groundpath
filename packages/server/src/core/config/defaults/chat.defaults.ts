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
  /** Retention window before soft-deleted conversations are physically purged */
  deletedConversationRetentionDays: 30,
  /** Batch size for purging soft-deleted conversations and cascaded messages */
  deletedConversationCleanupBatchSize: 100,
} as const;
