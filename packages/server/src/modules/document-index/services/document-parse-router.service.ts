import type { DocumentType } from '@knowledge-agent/shared/types';
import { documentIndexConfig, featureFlags } from '@config/env';

export type DocumentRouteMode = 'structured' | 'chunked';
export type DocumentRouteReason =
  | 'empty_content'
  | 'feature_disabled'
  | 'rollout_internal_not_implemented'
  | 'unsupported_document_type'
  | 'below_threshold'
  | 'meets_threshold';

export interface DocumentRouteDecision {
  routeMode: DocumentRouteMode;
  reason: DocumentRouteReason;
  estimatedTokens: number;
  thresholdTokens: number;
  structuredCandidate: boolean;
  rolloutMode: (typeof featureFlags)['structuredRagRolloutMode'];
}

const STRUCTURED_DOCUMENT_TYPES = new Set<DocumentType>(['markdown', 'text', 'docx', 'pdf']);

export const documentParseRouterService = {
  estimateTokens(textContent: string): number {
    return Math.ceil(textContent.length / documentIndexConfig.charsPerToken);
  },

  decideRoute(input: {
    documentType: DocumentType;
    textContent: string | null;
  }): DocumentRouteDecision {
    const textContent = input.textContent?.trim() ?? '';
    const estimatedTokens = textContent ? this.estimateTokens(textContent) : 0;
    const thresholdTokens = documentIndexConfig.routeTokenThreshold;
    const structuredCandidate = STRUCTURED_DOCUMENT_TYPES.has(input.documentType);
    const rolloutMode = featureFlags.structuredRagRolloutMode;

    if (!textContent) {
      return {
        routeMode: 'chunked',
        reason: 'empty_content',
        estimatedTokens,
        thresholdTokens,
        structuredCandidate,
        rolloutMode,
      };
    }

    if (!featureFlags.structuredRagEnabled || rolloutMode === 'disabled') {
      return {
        routeMode: 'chunked',
        reason: 'feature_disabled',
        estimatedTokens,
        thresholdTokens,
        structuredCandidate,
        rolloutMode,
      };
    }

    if (rolloutMode === 'internal') {
      return {
        routeMode: 'chunked',
        reason: 'rollout_internal_not_implemented',
        estimatedTokens,
        thresholdTokens,
        structuredCandidate,
        rolloutMode,
      };
    }

    if (!structuredCandidate) {
      return {
        routeMode: 'chunked',
        reason: 'unsupported_document_type',
        estimatedTokens,
        thresholdTokens,
        structuredCandidate,
        rolloutMode,
      };
    }

    if (estimatedTokens < thresholdTokens) {
      return {
        routeMode: 'chunked',
        reason: 'below_threshold',
        estimatedTokens,
        thresholdTokens,
        structuredCandidate,
        rolloutMode,
      };
    }

    return {
      routeMode: 'structured',
      reason: 'meets_threshold',
      estimatedTokens,
      thresholdTokens,
      structuredCandidate,
      rolloutMode,
    };
  },
};
