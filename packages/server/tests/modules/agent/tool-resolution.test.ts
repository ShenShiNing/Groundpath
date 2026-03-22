import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    agentConfig: {
      tavilyApiKey: '',
    },
    serverConfig: {
      nodeEnv: 'test',
    },
    loggingConfig: {
      level: 'silent',
    },
  },
  rolloutService: {
    isEnabledForTarget: vi.fn(),
  },
}));

vi.mock('@core/config/env', () => mocks.env);

vi.mock('@modules/document-index/public/rollout', () => ({
  structuredRagRolloutService: mocks.rolloutService,
}));

vi.mock('@modules/rag', () => ({
  searchService: {},
}));

vi.mock('@modules/document/public/repositories', () => ({
  documentRepository: {},
}));

vi.mock('@modules/agent/tools/kb-search.tool', () => ({
  KBSearchTool: class {
    definition = { name: 'knowledge_base_search' };
  },
}));

vi.mock('@modules/agent/tools/outline-search.tool', () => ({
  OutlineSearchTool: class {
    definition = { name: 'outline_search' };
  },
}));

vi.mock('@modules/agent/tools/node-read.tool', () => ({
  NodeReadTool: class {
    definition = { name: 'node_read' };
  },
}));

vi.mock('@modules/agent/tools/ref-follow.tool', () => ({
  RefFollowTool: class {
    definition = { name: 'ref_follow' };
  },
}));

vi.mock('@modules/agent/tools/vector-fallback-search.tool', () => ({
  VectorFallbackSearchTool: class {
    definition = { name: 'vector_fallback_search' };
  },
}));

vi.mock('@modules/agent/tools/web-search.tool', () => ({
  WebSearchTool: class {
    definition = { name: 'web_search' };
  },
}));

vi.mock('@core/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { resolveTools } from '@modules/agent/tools/index';

describe('resolveTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rolloutService.isEnabledForTarget.mockReturnValue(false);
    mocks.env.agentConfig.tavilyApiKey = '';
  });

  it('returns legacy KB search tool when structured rollout is not enabled for the target', () => {
    const tools = resolveTools({
      userId: 'user-1',
      conversationId: 'conv-1',
      knowledgeBaseId: 'kb-1',
    });

    expect(mocks.rolloutService.isEnabledForTarget).toHaveBeenCalledWith({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
    });
    expect(tools.map((tool) => tool.definition.name)).toEqual(['knowledge_base_search']);
  });

  it('returns structured KB tools when rollout is enabled for the target', () => {
    mocks.rolloutService.isEnabledForTarget.mockReturnValue(true);

    const tools = resolveTools({
      userId: 'user-1',
      conversationId: 'conv-1',
      knowledgeBaseId: 'kb-1',
    });

    expect(tools.map((tool) => tool.definition.name)).toEqual([
      'outline_search',
      'node_read',
      'ref_follow',
      'vector_fallback_search',
    ]);
  });

  it('adds web_search when Tavily is configured', () => {
    mocks.env.agentConfig.tavilyApiKey = 'tvly-test';

    const tools = resolveTools({
      userId: 'user-1',
      conversationId: 'conv-1',
    });

    expect(tools.map((tool) => tool.definition.name)).toEqual(['web_search']);
  });
});
