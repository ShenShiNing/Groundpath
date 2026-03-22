import type { DocumentType } from '@groundpath/shared/types';
import { documentIndexConfig, featureFlags } from '@config/env';
import { estimateDocumentTokens } from './document-token-estimator';
import { structuredRagRolloutService } from './structured-rag-rollout.service';

export type DocumentRouteMode = 'structured' | 'chunked';
export type DocumentRouteReason =
  | 'empty_content'
  | 'feature_disabled'
  | 'rollout_not_targeted'
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

const STRUCTURED_DOCUMENT_TYPES = new Set<DocumentType>(['markdown', 'docx', 'pdf']);

export const documentParseRouterService = {
  estimateTokens(textContent: string): number {
    return estimateDocumentTokens(textContent);
  },

  decideRoute(input: {
    documentType: DocumentType;
    textContent: string | null;
    userId?: string | null;
    knowledgeBaseId?: string | null;
  }): DocumentRouteDecision {
    const textContent = input.textContent?.trim() ?? '';
    const estimatedTokens = textContent ? this.estimateTokens(textContent) : 0;
    const thresholdTokens = documentIndexConfig.routeTokenThreshold;
    const structuredCandidate = STRUCTURED_DOCUMENT_TYPES.has(input.documentType);
    const rolloutMode = featureFlags.structuredRagRolloutMode;
    const rolloutDecision = structuredRagRolloutService.getDecision({
      userId: input.userId,
      knowledgeBaseId: input.knowledgeBaseId,
    });

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

    if (rolloutDecision.reason === 'feature_disabled') {
      return {
        routeMode: 'chunked',
        reason: 'feature_disabled',
        estimatedTokens,
        thresholdTokens,
        structuredCandidate,
        rolloutMode,
      };
    }

    if (!rolloutDecision.enabled) {
      return {
        routeMode: 'chunked',
        reason: 'rollout_not_targeted',
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
