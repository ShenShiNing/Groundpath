import { beforeEach, describe, expect, it, vi } from 'vitest';

const whereMock = vi.hoisted(() => vi.fn());
const innerJoinMock = vi.hoisted(() => vi.fn(() => ({ where: whereMock })));
const fromMock = vi.hoisted(() => vi.fn(() => ({ innerJoin: innerJoinMock })));
const selectMock = vi.hoisted(() => vi.fn(() => ({ from: fromMock })));

vi.mock('@core/db', () => ({
  db: {
    select: selectMock,
    execute: vi.fn(),
  },
}));

vi.mock('@core/config/env', () => ({
  documentConfig: {
    processingTimeoutMinutes: 30,
  },
}));

import { checkDocumentOwnershipMismatch } from '../../src/scripts/db-consistency-check/document.checks';

describe('checkDocumentOwnershipMismatch', () => {
  beforeEach(() => {
    selectMock.mockClear();
    fromMock.mockClear();
    innerJoinMock.mockClear();
    whereMock.mockReset();
  });

  it('passes when every document owner matches its knowledge base owner', async () => {
    whereMock.mockResolvedValue([]);

    const result = await checkDocumentOwnershipMismatch();

    expect(result).toEqual({
      name: '9. Document ownership mismatch (document.user_id != knowledge_base.user_id)',
      passed: true,
      count: 0,
      details: [],
    });
  });

  it('reports ownership drift with actionable details', async () => {
    whereMock.mockResolvedValue([
      {
        id: 'doc-1',
        title: 'Mismatched Document',
        documentUserId: 'user-doc',
        knowledgeBaseId: 'kb-1',
        knowledgeBaseUserId: 'user-kb',
      },
    ]);

    const result = await checkDocumentOwnershipMismatch();

    expect(result.passed).toBe(false);
    expect(result.count).toBe(1);
    expect(result.details).toEqual([
      'doc=doc-1 title="Mismatched Document" docUser=user-doc kb=kb-1 kbUser=user-kb',
    ]);
  });
});
