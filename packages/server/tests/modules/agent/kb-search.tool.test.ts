import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '@modules/agent/tools/tool.interface';

const { searchInKnowledgeBaseMock, getTitlesByIdsMock } = vi.hoisted(() => ({
  searchInKnowledgeBaseMock: vi.fn(),
  getTitlesByIdsMock: vi.fn(),
}));

vi.mock('@shared/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@modules/rag', () => ({
  searchService: { searchInKnowledgeBase: searchInKnowledgeBaseMock },
}));

vi.mock('@modules/document', () => ({
  documentRepository: { getTitlesByIds: getTitlesByIdsMock },
}));

import { KBSearchTool } from '@modules/agent/tools/kb-search.tool';

// ==================== Tests ====================

describe('KBSearchTool', () => {
  let tool: KBSearchTool;
  const baseCtx: ToolContext = {
    userId: 'user-1',
    conversationId: 'conv-1',
    knowledgeBaseId: 'kb-1',
    documentIds: ['doc-1'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new KBSearchTool();
  });

  it('should have correct definition', () => {
    expect(tool.definition.name).toBe('knowledge_base_search');
    expect(tool.definition.parameters).toBeDefined();
  });

  it('should return error when query is empty', async () => {
    const result = await tool.execute({ query: '' }, baseCtx);
    expect(result.content).toContain('empty');
    expect(searchInKnowledgeBaseMock).not.toHaveBeenCalled();
  });

  it('should return error when query is only whitespace', async () => {
    const result = await tool.execute({ query: '   ' }, baseCtx);
    expect(result.content).toContain('empty');
  });

  it('should return message when no knowledgeBaseId in context', async () => {
    const ctx: ToolContext = { userId: 'user-1', conversationId: 'conv-1' };
    const result = await tool.execute({ query: 'test' }, ctx);
    expect(result.content).toContain('No knowledge base');
    expect(searchInKnowledgeBaseMock).not.toHaveBeenCalled();
  });

  it('should return no results message when search returns empty', async () => {
    searchInKnowledgeBaseMock.mockResolvedValue([]);

    const result = await tool.execute({ query: 'something' }, baseCtx);

    expect(searchInKnowledgeBaseMock).toHaveBeenCalledWith({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      query: 'something',
      limit: 5,
      scoreThreshold: 0.5,
      documentIds: ['doc-1'],
    });
    expect(result.content).toContain('No relevant documents');
    expect(result.citations).toBeUndefined();
  });

  it('should return formatted results with citations', async () => {
    searchInKnowledgeBaseMock.mockResolvedValue([
      { documentId: 'doc-1', chunkIndex: 0, content: 'Chunk 1 text', score: 0.92 },
      { documentId: 'doc-2', chunkIndex: 3, content: 'Chunk 2 text', score: 0.85 },
    ]);
    getTitlesByIdsMock.mockResolvedValue(
      new Map([
        ['doc-1', 'Document Alpha'],
        ['doc-2', 'Document Beta'],
      ])
    );

    const result = await tool.execute({ query: 'search query' }, baseCtx);

    expect(result.content).toContain('Document Alpha');
    expect(result.content).toContain('Chunk 1 text');
    expect(result.content).toContain('Document Beta');
    expect(result.citations).toHaveLength(2);
    expect(result.citations![0]).toEqual({
      sourceType: 'chunk',
      documentId: 'doc-1',
      documentTitle: 'Document Alpha',
      chunkIndex: 0,
      content: 'Chunk 1 text',
      excerpt: 'Chunk 1 text',
      score: 0.92,
    });
    expect(result.citations![1]).toEqual({
      sourceType: 'chunk',
      documentId: 'doc-2',
      documentTitle: 'Document Beta',
      chunkIndex: 3,
      content: 'Chunk 2 text',
      excerpt: 'Chunk 2 text',
      score: 0.85,
    });
  });

  it('should use "Unknown Document" for missing titles', async () => {
    searchInKnowledgeBaseMock.mockResolvedValue([
      { documentId: 'doc-missing', chunkIndex: 0, content: 'orphan chunk', score: 0.7 },
    ]);
    getTitlesByIdsMock.mockResolvedValue(new Map());

    const result = await tool.execute({ query: 'test' }, baseCtx);

    expect(result.content).toContain('Unknown Document');
    expect(result.citations![0]!.documentTitle).toBe('Unknown Document');
  });

  it('should deduplicate document IDs when fetching titles', async () => {
    searchInKnowledgeBaseMock.mockResolvedValue([
      { documentId: 'doc-1', chunkIndex: 0, content: 'chunk A', score: 0.9 },
      { documentId: 'doc-1', chunkIndex: 1, content: 'chunk B', score: 0.8 },
    ]);
    getTitlesByIdsMock.mockResolvedValue(new Map([['doc-1', 'Same Doc']]));

    await tool.execute({ query: 'test' }, baseCtx);

    // Should only pass unique doc IDs
    const firstCall = getTitlesByIdsMock.mock.calls.at(0);
    expect(firstCall).toBeDefined();
    const calledIds = (firstCall?.[0] ?? []) as string[];
    expect(calledIds).toEqual(['doc-1']);
  });

  it('should coerce non-string query args to string', async () => {
    searchInKnowledgeBaseMock.mockResolvedValue([]);

    await tool.execute({ query: 12345 }, baseCtx);

    expect(searchInKnowledgeBaseMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: '12345' })
    );
  });
});
