import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentExecutorOptions } from '@modules/agent/agent-executor';
import type { AgentTool, ToolContext, ToolDefinition } from '@modules/agent/tools/tool.interface';
import type { LLMProvider, ChatMessage, GenerateOptions } from '@modules/llm';

vi.mock('@shared/config/env', () => ({
  agentConfig: { maxIterations: 5, maxStructuredRounds: 3, maxFallbackRounds: 1 },
}));

vi.mock('@shared/logger', () => ({
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

    await expect(executeAgentLoop(options)).rejects.toThrow('API rate limit');
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
        name: 'search',
        description: 'search',
        category: 'structured',
        parameters: { type: 'object', properties: {} },
      },
      execute: vi.fn().mockResolvedValue({
        content: 'found it',
        citations: [
          {
            sourceType: 'chunk',
            documentId: 'doc-1',
            documentTitle: 'Doc 1',
            chunkIndex: 0,
            content: 'chunk',
            score: 0.9,
          },
        ],
      }),
    };

    const generateWithTools = vi
      .fn()
      .mockResolvedValueOnce({
        finishReason: 'tool_calls',
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'search', arguments: {} }],
      })
      .mockResolvedValueOnce({
        finishReason: 'text',
        content: 'Answer with citation',
        toolCalls: [],
      });

    const provider = createMockProvider({ generateWithTools });
    const options = createBaseOptions({ provider, tools: [tool] });

    const result = await executeAgentLoop(options);

    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]!.documentId).toBe('doc-1');
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
});
