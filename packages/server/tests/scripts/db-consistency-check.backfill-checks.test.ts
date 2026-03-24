import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeMock = vi.hoisted(() => vi.fn());

vi.mock('@core/db', () => ({
  db: {
    execute: executeMock,
  },
}));

import {
  checkOrphanBackfillItems,
  checkOrphanBackfillRuns,
} from '../../src/scripts/db-consistency-check/backfill.checks';

describe('backfill consistency checks', () => {
  beforeEach(() => {
    executeMock.mockReset();
  });

  it('passes when no orphan backfill runs exist', async () => {
    executeMock.mockResolvedValue([[]]);

    const result = await checkOrphanBackfillRuns();

    expect(result).toEqual({
      name: '16. Orphan document_index_backfill_runs',
      passed: true,
      count: 0,
      details: [],
    });
  });

  it('reports orphan backfill runs with actionable details', async () => {
    executeMock.mockResolvedValue([
      [
        {
          id: 'run-1',
          knowledge_base_id: 'kb-missing',
          created_by: 'user-missing',
        },
      ],
    ]);

    const result = await checkOrphanBackfillRuns();

    expect(result.passed).toBe(false);
    expect(result.count).toBe(1);
    expect(result.details).toEqual(['run=run-1 knowledgeBase=kb-missing createdBy=user-missing']);
  });

  it('passes when no orphan backfill items exist', async () => {
    executeMock.mockResolvedValue([[]]);

    const result = await checkOrphanBackfillItems();

    expect(result).toEqual({
      name: '17. Orphan document_index_backfill_items',
      passed: true,
      count: 0,
      details: [],
    });
  });

  it('reports orphan backfill items with actionable details', async () => {
    executeMock.mockResolvedValue([
      [
        {
          id: 'item-1',
          run_id: 'run-missing',
          document_id: 'doc-missing',
          user_id: 'user-missing',
          knowledge_base_id: 'kb-missing',
        },
      ],
    ]);

    const result = await checkOrphanBackfillItems();

    expect(result.passed).toBe(false);
    expect(result.count).toBe(1);
    expect(result.details).toEqual([
      'item=item-1 run=run-missing doc=doc-missing user=user-missing kb=kb-missing',
    ]);
  });
});
