import { describe, expect, it, vi } from 'vitest';

const envMocks = vi.hoisted(() => ({
  documentIndexConfig: {
    routeTokenThreshold: 5000,
    charsPerToken: 4,
  },
  featureFlags: {
    structuredRagEnabled: false,
    structuredRagRolloutMode: 'disabled' as 'disabled' | 'internal' | 'all',
  },
}));

vi.mock('@config/env', () => envMocks);

import { documentParseRouterService } from '@modules/document-index/services/document-parse-router.service';

describe('documentParseRouterService', () => {
  it('returns chunked when content is empty', () => {
    const result = documentParseRouterService.decideRoute({
      documentType: 'markdown',
      textContent: '   ',
    });

    expect(result).toMatchObject({
      routeMode: 'chunked',
      reason: 'empty_content',
      estimatedTokens: 0,
    });
  });

  it('returns chunked when feature flag is disabled', () => {
    envMocks.featureFlags.structuredRagEnabled = false;
    envMocks.featureFlags.structuredRagRolloutMode = 'all';

    const result = documentParseRouterService.decideRoute({
      documentType: 'pdf',
      textContent: 'a'.repeat(40000),
    });

    expect(result).toMatchObject({
      routeMode: 'chunked',
      reason: 'feature_disabled',
    });
  });

  it('returns chunked when rollout mode is internal and targeting is not implemented', () => {
    envMocks.featureFlags.structuredRagEnabled = true;
    envMocks.featureFlags.structuredRagRolloutMode = 'internal';

    const result = documentParseRouterService.decideRoute({
      documentType: 'docx',
      textContent: 'a'.repeat(40000),
    });

    expect(result).toMatchObject({
      routeMode: 'chunked',
      reason: 'rollout_internal_not_implemented',
    });
  });

  it('returns chunked for unsupported document types', () => {
    envMocks.featureFlags.structuredRagEnabled = true;
    envMocks.featureFlags.structuredRagRolloutMode = 'all';

    for (const documentType of ['other', 'text'] as const) {
      const result = documentParseRouterService.decideRoute({
        documentType,
        textContent: 'a'.repeat(40000),
      });

      expect(result).toMatchObject({
        routeMode: 'chunked',
        reason: 'unsupported_document_type',
        structuredCandidate: false,
      });
    }
  });

  it('returns chunked when estimated tokens are below threshold', () => {
    envMocks.featureFlags.structuredRagEnabled = true;
    envMocks.featureFlags.structuredRagRolloutMode = 'all';

    const result = documentParseRouterService.decideRoute({
      documentType: 'markdown',
      textContent: 'a'.repeat(1000),
    });

    expect(result).toMatchObject({
      routeMode: 'chunked',
      reason: 'below_threshold',
      estimatedTokens: 250,
    });
  });

  it('returns structured for long markdown/pdf/docx documents when rollout mode is all', () => {
    envMocks.featureFlags.structuredRagEnabled = true;
    envMocks.featureFlags.structuredRagRolloutMode = 'all';

    for (const documentType of ['markdown', 'pdf', 'docx'] as const) {
      const result = documentParseRouterService.decideRoute({
        documentType,
        textContent: 'a'.repeat(24000),
      });

      expect(result).toMatchObject({
        routeMode: 'structured',
        reason: 'meets_threshold',
        estimatedTokens: 6000,
        structuredCandidate: true,
      });
    }
  });
});
