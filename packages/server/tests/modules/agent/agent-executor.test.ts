import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentExecutorOptions } from '@modules/agent/agent-executor';
import type { AgentTool, ToolContext, ToolDefinition } from '@modules/agent/tools/tool.interface';
import type { LLMProvider, ChatMessage, GenerateOptions } from '@modules/llm/public/runtime';
import type { Citation } from '@groundpath/shared/types';

vi.mock('@core/config/env', () => ({
  agentConfig: {
    maxIterations: 5,
    maxStructuredRounds: 3,
    maxFallbackRounds: 1,
    toolTimeout: 20,
    citationOutlineScoreCeiling: 30,
    citationNodeReadBaseScore: 0.7,
    citationRefFollowBaseScore: 0.6,
    citationMinDocuments: 3,
    citationMinScore: 0.35,
    citationParentScoreAdvantage: 0.15,
  },
}));

vi.mock('@core/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { executeAgentLoop } from '@modules/agent/agent-executor';

// ==================== Test Helpers ====================

function createMockProvider(overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    name: 'test-provider',
    generate: vi.fn().mockResolvedValue('plain response'),
    generateWithTools: vi.fn(),
    ...overrides,
  } as unknown as LLMProvider;
}

function createMockTool(
  name: string,
  result: string = 'tool result',
  category: ToolDefinition['category'] = 'structured'
): AgentTool {
  return {
    definition: {
      name,
      description: `Test tool: ${name}`,
      category,
      parameters: { type: 'object', properties: {} },
    } as ToolDefinition,
    execute: vi.fn().mockResolvedValue({ content: result }),
  };
}

function createBaseOptions(overrides: Partial<AgentExecutorOptions> = {}): AgentExecutorOptions {
  return {
    provider: createMockProvider(),
    messages: [{ role: 'user', content: 'Hello' }] as ChatMessage[],
    tools: [],
    toolContext: { userId: 'user-1', conversationId: 'conv-1' } as ToolContext,
    genOptions: {} as GenerateOptions,
    ...overrides,
  };
}

/** Helper to build a single-tool-call flow that returns citations, then answers */
function setupCitationFlow(
  tool: AgentTool,
  toolCallName: string
): { provider: LLMProvider; options: AgentExecutorOptions } {
  const generateWithTools = vi
    .fn()
    .mockResolvedValueOnce({
      finishReason: 'tool_calls',
      content: '',
      toolCalls: [{ id: 'tc-1', name: toolCallName, arguments: {} }],
    })
    .mockResolvedValueOnce({
      finishReason: 'text',
      content: 'Answer',
      toolCalls: [],
    });

  const provider = createMockProvider({ generateWithTools });
  const options = createBaseOptions({ provider, tools: [tool] });
  return { provider, options };
}

function makeNodeCitation(overrides: Partial<Citation> = {}): Citation {
  return {
    sourceType: 'node',
    documentId: 'doc-1',
    documentTitle: 'Doc 1',
    nodeId: 'node-1',
    excerpt: 'text',
    score: 0.8,
    ...overrides,
  } as Citation;
}

function makeChunkCitation(overrides: Partial<Citation> = {}): Citation {
  return {
    sourceType: 'chunk',
    documentId: 'doc-1',
    documentTitle: 'Doc 1',
    chunkIndex: 0,
    content: 'chunk content',
    score: 0.8,
    ...overrides,
  } as Citation;
}

// ==================== Tests ====================

describe('executeAgentLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Fallback when provider has no tool support ──

  it('should fallback to plain generate when provider has no generateWithTools', async () => {
    const provider = createMockProvider({ generateWithTools: undefined });
    const options = createBaseOptions({ provider });

    const result = await executeAgentLoop(options);

    expect(provider.generate).toHaveBeenCalledOnce();
    expect(result.content).toBe('plain response');
    expect(result.citations).toEqual([]);
    expect(result.retrievedCitations).toEqual([]);
    expect(result.agentTrace).toEqual([]);
  });

  // ── Direct text response (no tool calls) ──

  it('should return content when LLM finishes with text', async () => {
    const provider = createMockProvider({
      generateWithTools: vi.fn().mockResolvedValue({
        finishReason: 'text',
        content: 'Final answer',
        toolCalls: [],
      }),
    });
    const options = createBaseOptions({ provider });

    const result = await executeAgentLoop(options);

    expect(result.content).toBe('Final answer');
    expect(result.agentTrace).toEqual([]);
    expect(result.stopReason).toBe('answered');
    expect(result.agentMessages).toBeUndefined();
    expect(result.retrievedCitations).toEqual([]);
  });

  it('should return content when LLM returns empty toolCalls', async () => {
    const provider = createMockProvider({
      generateWithTools: vi.fn().mockResolvedValue({
        finishReason: 'stop',
        content: 'No tools needed',
        toolCalls: [],
      }),
    });
    const options = createBaseOptions({ provider });

    const result = await executeAgentLoop(options);

    expect(result.content).toBe('No tools needed');
    expect(result.stopReason).toBe('answered');
    expect(result.retrievedCitations).toEqual([]);
  });

  // ── Tool execution flow ──

  it('should execute tool and return final answer', async () => {
    const tool = createMockTool('search', 'found relevant info');
    const generateWithTools = vi
      .fn()
      .mockResolvedValueOnce({
        finishReason: 'tool_calls',
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'search', arguments: { query: 'test' } }],
      })
      .mockResolvedValueOnce({
        finishReason: 'text',
        content: 'Here is the answer based on search',
        toolCalls: [],
      });

    const provider = createMockProvider({ generateWithTools });
    const options = createBaseOptions({ provider, tools: [tool] });

    const result = await executeAgentLoop(options);

    expect(tool.execute).toHaveBeenCalledWith({ query: 'test' }, options.toolContext);
    expect(result.content).toBe('Here is the answer based on search');
    expect(result.agentTrace).toHaveLength(1);
    expect(result.agentMessages).toEqual([
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'search', arguments: { query: 'test' } }],
      },
      { role: 'tool', content: 'found relevant info', toolCallId: 'tc-1' },
    ]);
    expect(result.agentTrace[0]!.toolCalls).toHaveLength(1);
    expect(result.agentTrace[0]!.toolResults).toHaveLength(1);
    expect(result.agentTrace[0]!.toolResults[0]!.content).toBe('found relevant info');
  });

  // ── Unknown tool handling ──

  it('should handle unknown tool name gracefully', async () => {
    const generateWithTools = vi
      .fn()
      .mockResolvedValueOnce({
        finishReason: 'tool_calls',
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'nonexistent_tool', arguments: {} }],
      })
      .mockResolvedValueOnce({
        finishReason: 'text',
        content: 'Handled missing tool',
        toolCalls: [],
      });

    const provider = createMockProvider({ generateWithTools });
    const options = createBaseOptions({ provider });

    const result = await executeAgentLoop(options);

    expect(result.content).toBe('Handled missing tool');
    expect(result.agentTrace[0]!.toolResults[0]!.isError).toBe(true);
    expect(result.agentTrace[0]!.toolResults[0]!.content).toContain('not found');
  });

  // ── Tool execution failure ──

  it('should catch tool execution errors and continue', async () => {
    const tool = createMockTool('failing_tool');
    vi.mocked(tool.execute).mockRejectedValue(new Error('Connection timeout'));

    const generateWithTools = vi
      .fn()
      .mockResolvedValueOnce({
        finishReason: 'tool_calls',
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'failing_tool', arguments: {} }],
      })
      .mockResolvedValueOnce({
        finishReason: 'text',
        content: 'Recovered from error',
        toolCalls: [],
      });

    const provider = createMockProvider({ generateWithTools });
    const options = createBaseOptions({ provider, tools: [tool] });

    const result = await executeAgentLoop(options);

    expect(result.content).toBe('Recovered from error');
    expect(result.agentTrace[0]!.toolResults[0]!.isError).toBe(true);
    expect(result.agentTrace[0]!.toolResults[0]!.content).toContain('Connection timeout');
  });

  // ── Max iterations exceeded ──

  it('should fallback to plain generate after exceeding maxIterations', async () => {
    const tool = createMockTool('loop_tool');
    const generateWithTools = vi.fn().mockResolvedValue({
      finishReason: 'tool_calls',
      content: '',
      toolCalls: [{ id: 'tc-1', name: 'loop_tool', arguments: {} }],
    });

    const provider = createMockProvider({
      generateWithTools,
      generate: vi.fn().mockResolvedValue('Final fallback answer'),
    });
    const options = createBaseOptions({
      provider,
      tools: [tool],
      maxIterations: 2,
    });

    const result = await executeAgentLoop(options);

    expect(generateWithTools).toHaveBeenCalledTimes(2);
    expect(provider.generate).toHaveBeenCalledOnce();
    expect(result.content).toBe('Final fallback answer');
    expect(result.agentTrace).toHaveLength(2);
  });

  // ── Abort signal ──

  it('should stop loop when signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const tool = createMockTool('search');
    const generateWithTools = vi.fn();
    const provider = createMockProvider({ generateWithTools });

    const options = createBaseOptions({
      provider,
      tools: [tool],
      toolContext: {
        userId: 'user-1',
        conversationId: 'conv-1',
        signal: controller.signal,
      },
    });

    const result = await executeAgentLoop(options);

    // Loop breaks immediately; falls through to plain generate fallback
    expect(generateWithTools).not.toHaveBeenCalled();
    expect(provider.generate).toHaveBeenCalledOnce();
    expect(result.content).toBe('plain response');
  });

  // ── LLM call failure ──

  it('should re-throw AbortError from LLM call', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    const generateWithTools = vi.fn().mockRejectedValue(abortError);
    const provider = createMockProvider({ generateWithTools });
    const options = createBaseOptions({ provider });

    await expect(executeAgentLoop(options)).rejects.toThrow(abortError);
  });

  it('should re-throw non-abort LLM errors', async () => {
    const generateWithTools = vi.fn().mockRejectedValue(new Error('API rate limit'));
    const provider = createMockProvider({ generateWithTools });
    const options = createBaseOptions({ provider });

    const result = await executeAgentLoop(options);

    expect(result.stopReason).toBe('provider_error');
    expect(result.content).toContain('provider failed');
  });

  // ── Callbacks ──

  it('should invoke onToolStart and onToolEnd callbacks', async () => {
    const tool = createMockTool('search', 'result');
    const onToolStart = vi.fn();
    const onToolEnd = vi.fn();

    const generateWithTools = vi
      .fn()
      .mockResolvedValueOnce({
        finishReason: 'tool_calls',
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'search', arguments: {} }],
      })
      .mockResolvedValueOnce({
        finishReason: 'text',
        content: 'Done',
        toolCalls: [],
      });

    const provider = createMockProvider({ generateWithTools });
    const options = createBaseOptions({
      provider,
      tools: [tool],
      onToolStart,
      onToolEnd,
    });

    await executeAgentLoop(options);

    expect(onToolStart).toHaveBeenCalledWith(0, [{ id: 'tc-1', name: 'search', arguments: {} }]);
    expect(onToolEnd).toHaveBeenCalledWith(
      0,
      expect.arrayContaining([expect.objectContaining({ name: 'search' })]),
      expect.any(Number)
    );
  });

  // ── Citations accumulation ──

  it('should accumulate citations from tool results', async () => {
    const tool: AgentTool = {
      definition: {
        name: 'outline_search',
        description: 'search',
        category: 'structured',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn().mockResolvedValue({
        content: 'found it',
        citations: [makeNodeCitation({ score: 25 })],
      }),
    };

    const { options } = setupCitationFlow(tool, 'outline_search');
    const result = await executeAgentLoop(options);

    expect(result.citations).toHaveLength(1);
    expect(result.retrievedCitations).toHaveLength(1);
    expect(result.citations[0]!.documentId).toBe('doc-1');
  });

  it('deduplicates final citations while preserving retrieved citations', async () => {
    const tool: AgentTool = {
      definition: {
        name: 'outline_search',
        description: 'search',
        category: 'structured',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi
        .fn()
        .mockResolvedValueOnce({
          content: 'first',
          citations: [makeNodeCitation({ score: 10 })],
        })
        .mockResolvedValueOnce({
          content: 'second',
          citations: [makeNodeCitation({ score: 25 })],
        }),
    };

    const generateWithTools = vi
      .fn()
      .mockResolvedValueOnce({
        finishReason: 'tool_calls',
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'outline_search', arguments: {} }],
      })
      .mockResolvedValueOnce({
        finishReason: 'tool_calls',
        content: '',
        toolCalls: [{ id: 'tc-2', name: 'outline_search', arguments: {} }],
      })
      .mockResolvedValueOnce({
        finishReason: 'text',
        content: 'Answer',
        toolCalls: [],
      });

    const provider = createMockProvider({ generateWithTools });
    const result = await executeAgentLoop(createBaseOptions({ provider, tools: [tool] }));

    expect(result.retrievedCitations).toHaveLength(2);
    expect(result.citations).toHaveLength(1);
    // Higher raw score (25) normalizes to 25/30 ≈ 0.833 > 10/30 ≈ 0.333
    expect(result.citations[0]!.score).toBe(25);
  });

  // ── Multiple concurrent tool calls ──

  it('should execute multiple tool calls concurrently', async () => {
    const tool1 = createMockTool('search', 'search result');
    const tool2 = createMockTool('web_search', 'web result', 'external');

    const generateWithTools = vi
      .fn()
      .mockResolvedValueOnce({
        finishReason: 'tool_calls',
        content: '',
        toolCalls: [
          { id: 'tc-1', name: 'search', arguments: { q: 'a' } },
          { id: 'tc-2', name: 'web_search', arguments: { q: 'b' } },
        ],
      })
      .mockResolvedValueOnce({
        finishReason: 'text',
        content: 'Combined answer',
        toolCalls: [],
      });

    const provider = createMockProvider({ generateWithTools });
    const options = createBaseOptions({ provider, tools: [tool1, tool2] });

    const result = await executeAgentLoop(options);

    expect(tool1.execute).toHaveBeenCalledOnce();
    expect(tool2.execute).toHaveBeenCalledOnce();
    expect(result.agentTrace[0]!.toolCalls).toHaveLength(2);
    expect(result.agentTrace[0]!.toolResults).toHaveLength(2);
  });

  it('reuses identical tool calls from runtime cache without re-executing the tool', async () => {
    const tool = createMockTool('outline_search', 'cached result', 'structured');

    const generateWithTools = vi
      .fn()
      .mockResolvedValueOnce({
        finishReason: 'tool_calls',
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'outline_search', arguments: { query: 'same' } }],
      })
      .mockResolvedValueOnce({
        finishReason: 'tool_calls',
        content: '',
        toolCalls: [{ id: 'tc-2', name: 'outline_search', arguments: { query: 'same' } }],
      })
      .mockResolvedValueOnce({
        finishReason: 'text',
        content: 'Answer',
        toolCalls: [],
      });

    const provider = createMockProvider({ generateWithTools });
    const result = await executeAgentLoop(
      createBaseOptions({
        provider,
        tools: [tool],
        toolContext: {
          userId: 'user-1',
          conversationId: 'conv-1',
          runtimeState: {},
        },
      })
    );

    expect(tool.execute).toHaveBeenCalledTimes(1);
    expect(result.agentTrace).toHaveLength(2);
  });

  it('should stop with budget_exhausted when structured tool budget is exceeded', async () => {
    const tool = createMockTool('outline_search', 'structured result', 'structured');
    const generateWithTools = vi.fn().mockResolvedValueOnce({
      finishReason: 'tool_calls',
      content: '',
      toolCalls: [
        { id: 'tc-1', name: 'outline_search', arguments: { query: 'one' } },
        { id: 'tc-2', name: 'outline_search', arguments: { query: 'two' } },
        { id: 'tc-3', name: 'outline_search', arguments: { query: 'three' } },
        { id: 'tc-4', name: 'outline_search', arguments: { query: 'four' } },
      ],
    });

    const provider = createMockProvider({
      generateWithTools,
      generate: vi.fn().mockResolvedValue('Budget limited answer'),
    });
    const options = createBaseOptions({
      provider,
      tools: [tool],
    });

    const result = await executeAgentLoop(options);

    expect(tool.execute).not.toHaveBeenCalled();
    expect(provider.generate).toHaveBeenCalledOnce();
    expect(result.stopReason).toBe('budget_exhausted');
  });

  it('should stop with tool_timeout when a tool exceeds the configured timeout', async () => {
    const tool = createMockTool('slow_tool');
    vi.mocked(tool.execute).mockImplementation(
      () => new Promise(() => undefined) as Promise<{ content: string }>
    );

    const generateWithTools = vi.fn().mockResolvedValueOnce({
      finishReason: 'tool_calls',
      content: '',
      toolCalls: [{ id: 'tc-1', name: 'slow_tool', arguments: {} }],
    });

    const provider = createMockProvider({
      generateWithTools,
      generate: vi.fn().mockResolvedValue('Timed out answer'),
    });

    const result = await executeAgentLoop(
      createBaseOptions({
        provider,
        tools: [tool],
      })
    );

    expect(provider.generate).toHaveBeenCalledOnce();
    expect(result.stopReason).toBe('tool_timeout');
    expect(result.content).toBe('Timed out answer');
    expect(result.agentTrace[0]?.toolResults[0]).toMatchObject({
      name: 'slow_tool',
      isError: true,
      isTimeout: true,
    });
  });

  it('marks answered tool runs without citations as insufficient_evidence for knowledge tools', async () => {
    const tool = createMockTool('outline_search', 'no matches', 'structured');
    const generateWithTools = vi
      .fn()
      .mockResolvedValueOnce({
        finishReason: 'tool_calls',
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'outline_search', arguments: { query: 'missing' } }],
      })
      .mockResolvedValueOnce({
        finishReason: 'text',
        content: 'I could not find enough support in the indexed documents.',
        toolCalls: [],
      });

    const provider = createMockProvider({ generateWithTools });

    const result = await executeAgentLoop(
      createBaseOptions({
        provider,
        tools: [tool],
      })
    );

    expect(result.stopReason).toBe('insufficient_evidence');
    expect(result.citations).toEqual([]);
    expect(result.retrievedCitations).toEqual([]);
  });

  it('does not mark insufficient_evidence when only external tools executed', async () => {
    const knowledgeTool = createMockTool('outline_search', 'kb result', 'structured');
    const webTool = createMockTool('web_search', 'web result', 'external');
    const generateWithTools = vi
      .fn()
      .mockResolvedValueOnce({
        finishReason: 'tool_calls',
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'web_search', arguments: { query: 'latest news' } }],
      })
      .mockResolvedValueOnce({
        finishReason: 'text',
        content: 'I answered from web search results.',
        toolCalls: [],
      });

    const provider = createMockProvider({ generateWithTools });

    const result = await executeAgentLoop(
      createBaseOptions({
        provider,
        tools: [knowledgeTool, webTool],
      })
    );

    expect(webTool.execute).toHaveBeenCalledOnce();
    expect(knowledgeTool.execute).not.toHaveBeenCalled();
    expect(result.stopReason).toBe('answered');
    expect(result.citations).toEqual([]);
  });

  // ============================================================
  // Evidence Selection (5-pass finalizeCitations) Tests
  // ============================================================

  describe('score normalization', () => {
    it('normalizes outline_search scores by ceiling (30)', async () => {
      const tool: AgentTool = {
        definition: {
          name: 'outline_search',
          description: 'search',
          category: 'structured',
          parameters: { type: 'object', properties: {} },
        },
        execute: vi.fn().mockResolvedValue({
          content: 'found',
          citations: [
            makeNodeCitation({ nodeId: 'n-low', score: 15 }),
            makeNodeCitation({ nodeId: 'n-high', score: 35 }),
          ],
        }),
      };

      const { options } = setupCitationFlow(tool, 'outline_search');
      const result = await executeAgentLoop(options);

      // 15/30 = 0.5 → above minScore(0.35), 35/30 = 1.167 → capped at 1.0
      expect(result.citations).toHaveLength(2);
      // Higher raw score should be first (both pass min-score)
      expect(result.citations[0]!.score).toBe(35);
      expect(result.citations[1]!.score).toBe(15);
    });

    it('passes vector search scores through unchanged', async () => {
      const tool: AgentTool = {
        definition: {
          name: 'knowledge_base_search',
          description: 'vector search',
          category: 'fallback',
          parameters: { type: 'object', properties: {} },
        },
        execute: vi.fn().mockResolvedValue({
          content: 'found',
          citations: [makeChunkCitation({ chunkIndex: 0, score: 0.85 })],
        }),
      };

      const { options } = setupCitationFlow(tool, 'knowledge_base_search');
      const result = await executeAgentLoop(options);

      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]!.score).toBe(0.85);
    });

    it('assigns fixed score 0.70 to node_read citations', async () => {
      const tool: AgentTool = {
        definition: {
          name: 'node_read',
          description: 'read node',
          category: 'structured',
          parameters: { type: 'object', properties: {} },
        },
        execute: vi.fn().mockResolvedValue({
          content: 'node content',
          citations: [makeNodeCitation({ nodeId: 'nr-1', score: undefined })],
        }),
      };

      const { options } = setupCitationFlow(tool, 'node_read');
      const result = await executeAgentLoop(options);

      // nodeRead gets normalized to 0.70, which is above minScore(0.35)
      expect(result.citations).toHaveLength(1);
    });

    it('assigns fixed score 0.60 to ref_follow citations', async () => {
      const tool: AgentTool = {
        definition: {
          name: 'ref_follow',
          description: 'follow ref',
          category: 'structured',
          parameters: { type: 'object', properties: {} },
        },
        execute: vi.fn().mockResolvedValue({
          content: 'ref content',
          citations: [makeNodeCitation({ nodeId: 'rf-1', score: undefined })],
        }),
      };

      const { options } = setupCitationFlow(tool, 'ref_follow');
      const result = await executeAgentLoop(options);

      // refFollow gets normalized to 0.60, above minScore(0.35)
      expect(result.citations).toHaveLength(1);
    });

    it('filters out citations below min-score threshold', async () => {
      const tool: AgentTool = {
        definition: {
          name: 'outline_search',
          description: 'search',
          category: 'structured',
          parameters: { type: 'object', properties: {} },
        },
        execute: vi.fn().mockResolvedValue({
          content: 'found',
          citations: [
            makeNodeCitation({ nodeId: 'n-good', score: 20 }),
            makeNodeCitation({ nodeId: 'n-bad', score: 5 }),
          ],
        }),
      };

      const { options } = setupCitationFlow(tool, 'outline_search');
      const result = await executeAgentLoop(options);

      // 20/30 ≈ 0.67 → passes; 5/30 ≈ 0.17 → filtered
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]!.score).toBe(20);
    });
  });

  describe('cross-document diversity', () => {
    it('guarantees citations from multiple documents when available', async () => {
      const citations: Citation[] = [];
      // 5 citations from doc-A (high scores) and 1 each from doc-B, doc-C
      for (let i = 0; i < 5; i++) {
        citations.push(
          makeNodeCitation({
            documentId: 'doc-A',
            nodeId: `nA-${i}`,
            score: 28 - i,
          })
        );
      }
      citations.push(makeNodeCitation({ documentId: 'doc-B', nodeId: 'nB-0', score: 12 }));
      citations.push(makeNodeCitation({ documentId: 'doc-C', nodeId: 'nC-0', score: 11 }));

      const tool: AgentTool = {
        definition: {
          name: 'outline_search',
          description: 'search',
          category: 'structured',
          parameters: { type: 'object', properties: {} },
        },
        execute: vi.fn().mockResolvedValue({ content: 'found', citations }),
      };

      const { options } = setupCitationFlow(tool, 'outline_search');
      const result = await executeAgentLoop(options);

      // doc-B (12/30=0.4) and doc-C (11/30≈0.37) both pass minScore
      // Diversity should ensure doc-B and doc-C are represented
      const docIds = new Set(result.citations.map((c) => c.documentId));
      expect(docIds.has('doc-A')).toBe(true);
      expect(docIds.has('doc-B')).toBe(true);
      expect(docIds.has('doc-C')).toBe(true);
    });

    it('does not force low-scoring documents into results', async () => {
      const citations: Citation[] = [
        makeNodeCitation({ documentId: 'doc-A', nodeId: 'nA-0', score: 25 }),
        makeNodeCitation({ documentId: 'doc-B', nodeId: 'nB-0', score: 3 }),
      ];

      const tool: AgentTool = {
        definition: {
          name: 'outline_search',
          description: 'search',
          category: 'structured',
          parameters: { type: 'object', properties: {} },
        },
        execute: vi.fn().mockResolvedValue({ content: 'found', citations }),
      };

      const { options } = setupCitationFlow(tool, 'outline_search');
      const result = await executeAgentLoop(options);

      // doc-B score 3/30=0.1 → below minScore(0.35) → filtered out
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]!.documentId).toBe('doc-A');
    });
  });

  describe('section path redundancy', () => {
    it('removes parent when child has comparable or higher score', async () => {
      const citations: Citation[] = [
        makeNodeCitation({
          nodeId: 'parent',
          sectionPath: ['Chapter 1'],
          score: 20,
        }),
        makeNodeCitation({
          nodeId: 'child',
          sectionPath: ['Chapter 1', 'Section 1.1'],
          score: 18,
        }),
      ];

      const tool: AgentTool = {
        definition: {
          name: 'outline_search',
          description: 'search',
          category: 'structured',
          parameters: { type: 'object', properties: {} },
        },
        execute: vi.fn().mockResolvedValue({ content: 'found', citations }),
      };

      const { options } = setupCitationFlow(tool, 'outline_search');
      const result = await executeAgentLoop(options);

      // parent: 20/30≈0.667, child: 18/30=0.6 → diff=0.067 < 0.15 → keep child
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]!.nodeId).toBe('child');
    });

    it('keeps parent when its score significantly exceeds child', async () => {
      const citations: Citation[] = [
        makeNodeCitation({
          nodeId: 'parent',
          sectionPath: ['Chapter 1'],
          score: 28,
        }),
        makeNodeCitation({
          nodeId: 'child',
          sectionPath: ['Chapter 1', 'Section 1.1'],
          score: 12,
        }),
      ];

      const tool: AgentTool = {
        definition: {
          name: 'outline_search',
          description: 'search',
          category: 'structured',
          parameters: { type: 'object', properties: {} },
        },
        execute: vi.fn().mockResolvedValue({ content: 'found', citations }),
      };

      const { options } = setupCitationFlow(tool, 'outline_search');
      const result = await executeAgentLoop(options);

      // parent: 28/30≈0.933, child: 12/30=0.4 → diff=0.533 > 0.15 → keep parent
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]!.nodeId).toBe('parent');
    });

    it('does not apply section redundancy to chunk citations', async () => {
      const citations: Citation[] = [
        makeChunkCitation({ chunkIndex: 0, score: 0.8 }),
        makeChunkCitation({ chunkIndex: 1, score: 0.7 }),
      ];

      const tool: AgentTool = {
        definition: {
          name: 'knowledge_base_search',
          description: 'search',
          category: 'fallback',
          parameters: { type: 'object', properties: {} },
        },
        execute: vi.fn().mockResolvedValue({ content: 'found', citations }),
      };

      const { options } = setupCitationFlow(tool, 'knowledge_base_search');
      const result = await executeAgentLoop(options);

      // Both chunks pass minScore and are not subject to section redundancy
      expect(result.citations).toHaveLength(2);
    });
  });

  describe('fair treatment of tool sources', () => {
    it('includes node_read and ref_follow citations alongside search results', async () => {
      const searchTool: AgentTool = {
        definition: {
          name: 'outline_search',
          description: 'search',
          category: 'structured',
          parameters: { type: 'object', properties: {} },
        },
        execute: vi.fn().mockResolvedValue({
          content: 'search results',
          citations: [makeNodeCitation({ documentId: 'doc-1', nodeId: 'os-1', score: 20 })],
        }),
      };

      const readTool: AgentTool = {
        definition: {
          name: 'node_read',
          description: 'read node',
          category: 'structured',
          parameters: { type: 'object', properties: {} },
        },
        execute: vi.fn().mockResolvedValue({
          content: 'node content',
          citations: [makeNodeCitation({ documentId: 'doc-2', nodeId: 'nr-1', score: undefined })],
        }),
      };

      const refTool: AgentTool = {
        definition: {
          name: 'ref_follow',
          description: 'follow ref',
          category: 'structured',
          parameters: { type: 'object', properties: {} },
        },
        execute: vi.fn().mockResolvedValue({
          content: 'ref content',
          citations: [makeNodeCitation({ documentId: 'doc-3', nodeId: 'rf-1', score: undefined })],
        }),
      };

      const generateWithTools = vi
        .fn()
        .mockResolvedValueOnce({
          finishReason: 'tool_calls',
          content: '',
          toolCalls: [
            { id: 'tc-1', name: 'outline_search', arguments: {} },
            { id: 'tc-2', name: 'node_read', arguments: {} },
            { id: 'tc-3', name: 'ref_follow', arguments: {} },
          ],
        })
        .mockResolvedValueOnce({
          finishReason: 'text',
          content: 'Combined answer',
          toolCalls: [],
        });

      const provider = createMockProvider({ generateWithTools });
      const options = createBaseOptions({
        provider,
        tools: [searchTool, readTool, refTool],
      });

      const result = await executeAgentLoop(options);

      // All three should be included: outline(20/30≈0.67), nodeRead(0.70), refFollow(0.60)
      expect(result.citations).toHaveLength(3);
      const nodeIds = result.citations.map((c) => (c as { nodeId: string }).nodeId);
      expect(nodeIds).toContain('os-1');
      expect(nodeIds).toContain('nr-1');
      expect(nodeIds).toContain('rf-1');
    });
  });

  describe('edge cases', () => {
    it('handles empty citations array', async () => {
      const tool: AgentTool = {
        definition: {
          name: 'outline_search',
          description: 'search',
          category: 'structured',
          parameters: { type: 'object', properties: {} },
        },
        execute: vi.fn().mockResolvedValue({ content: 'nothing', citations: [] }),
      };

      const { options } = setupCitationFlow(tool, 'outline_search');
      const result = await executeAgentLoop(options);

      expect(result.citations).toEqual([]);
      expect(result.retrievedCitations).toEqual([]);
    });

    it('returns all citations when fewer than maxItems', async () => {
      const tool: AgentTool = {
        definition: {
          name: 'outline_search',
          description: 'search',
          category: 'structured',
          parameters: { type: 'object', properties: {} },
        },
        execute: vi.fn().mockResolvedValue({
          content: 'found',
          citations: [
            makeNodeCitation({ nodeId: 'n1', score: 20 }),
            makeNodeCitation({ nodeId: 'n2', score: 18 }),
          ],
        }),
      };

      const { options } = setupCitationFlow(tool, 'outline_search');
      const result = await executeAgentLoop(options);

      // 2 citations < maxItems(8), both pass minScore → all returned
      expect(result.citations).toHaveLength(2);
    });

    it('handles single-tool source without issues', async () => {
      const tool: AgentTool = {
        definition: {
          name: 'vector_fallback_search',
          description: 'fallback',
          category: 'fallback',
          parameters: { type: 'object', properties: {} },
        },
        execute: vi.fn().mockResolvedValue({
          content: 'found',
          citations: [
            makeChunkCitation({ documentId: 'doc-1', chunkIndex: 0, score: 0.9 }),
            makeChunkCitation({ documentId: 'doc-2', chunkIndex: 0, score: 0.7 }),
            makeChunkCitation({ documentId: 'doc-3', chunkIndex: 0, score: 0.5 }),
          ],
        }),
      };

      const { options } = setupCitationFlow(tool, 'vector_fallback_search');
      const result = await executeAgentLoop(options);

      expect(result.citations).toHaveLength(3);
      // Should be sorted by score descending
      expect(result.citations[0]!.score).toBe(0.9);
      expect(result.citations[1]!.score).toBe(0.7);
      expect(result.citations[2]!.score).toBe(0.5);
    });
  });
});
