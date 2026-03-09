import { featureFlags } from '@config/env';

export interface StructuredRagTarget {
  userId?: string | null;
  knowledgeBaseId?: string | null;
}

export type StructuredRagRolloutDecisionReason =
  | 'feature_disabled'
  | 'internal_not_targeted'
  | 'internal_targeted'
  | 'all';

function matchesAllowList(allowList: readonly string[], value?: string | null): boolean {
  return !!value && allowList.includes(value);
}

export const structuredRagRolloutService = {
  getDecision(target: StructuredRagTarget): {
    enabled: boolean;
    rolloutMode: (typeof featureFlags)['structuredRagRolloutMode'];
    reason: StructuredRagRolloutDecisionReason;
  } {
    const rolloutMode = featureFlags.structuredRagRolloutMode;

    if (!featureFlags.structuredRagEnabled || rolloutMode === 'disabled') {
      return {
        enabled: false,
        rolloutMode,
        reason: 'feature_disabled',
      };
    }

    if (rolloutMode === 'all') {
      return {
        enabled: true,
        rolloutMode,
        reason: 'all',
      };
    }

    const targeted =
      matchesAllowList(featureFlags.structuredRagInternalUserIds, target.userId) ||
      matchesAllowList(featureFlags.structuredRagInternalKnowledgeBaseIds, target.knowledgeBaseId);

    return {
      enabled: targeted,
      rolloutMode,
      reason: targeted ? 'internal_targeted' : 'internal_not_targeted',
    };
  },

  isEnabledForTarget(target: StructuredRagTarget): boolean {
    return this.getDecision(target).enabled;
  },
};
