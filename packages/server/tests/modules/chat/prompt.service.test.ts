import { describe, expect, it } from 'vitest';
import { promptService } from '@modules/chat/services/prompt.service';

describe('promptService.buildAgentSystemPrompt', () => {
  it('returns KB-only prompt when only knowledge base is available', () => {
    const prompt = promptService.buildAgentSystemPrompt({
      hasKnowledgeBase: true,
      hasWebSearch: false,
      hasStructuredKnowledgeBase: false,
    });

    expect(prompt).toContain('knowledge_base_search');
    expect(prompt).toContain('MUST');
    expect(prompt).not.toContain('web_search');
  });

  it('returns web-only prompt when only web search is available', () => {
    const prompt = promptService.buildAgentSystemPrompt({
      hasKnowledgeBase: false,
      hasWebSearch: true,
      hasStructuredKnowledgeBase: false,
    });

    expect(prompt).toContain('web_search');
    expect(prompt).not.toContain('knowledge_base_search');
  });

  it('returns combined prompt when both KB and web search are available', () => {
    const prompt = promptService.buildAgentSystemPrompt({
      hasKnowledgeBase: true,
      hasWebSearch: true,
      hasStructuredKnowledgeBase: false,
    });

    expect(prompt).toContain('knowledge_base_search');
    expect(prompt).toContain('web_search');
    expect(prompt).toContain('MUST');
  });

  it('KB prompt enforces mandatory search before answering', () => {
    const kbOnly = promptService.buildAgentSystemPrompt({
      hasKnowledgeBase: true,
      hasWebSearch: false,
      hasStructuredKnowledgeBase: false,
    });
    const kbAndWeb = promptService.buildAgentSystemPrompt({
      hasKnowledgeBase: true,
      hasWebSearch: true,
      hasStructuredKnowledgeBase: false,
    });

    // Both KB prompts should enforce searching first
    for (const prompt of [kbOnly, kbAndWeb]) {
      expect(prompt).toContain('ALWAYS use knowledge_base_search first');
      expect(prompt).toContain('Do not answer from memory alone');
    }
  });

  it('KB prompt encourages query rephrasing for multiple searches', () => {
    const prompt = promptService.buildAgentSystemPrompt({
      hasKnowledgeBase: true,
      hasWebSearch: false,
      hasStructuredKnowledgeBase: false,
    });

    expect(prompt).toContain('rephrasing your query');
  });

  it('returns structured KB prompt when structured tools are available', () => {
    const prompt = promptService.buildAgentSystemPrompt({
      hasKnowledgeBase: true,
      hasWebSearch: false,
      hasStructuredKnowledgeBase: true,
    });

    expect(prompt).toContain('outline_search');
    expect(prompt).toContain('node_read');
    expect(prompt).toContain('ref_follow');
    expect(prompt).toContain('vector_fallback_search');
  });
});

describe('promptService.buildSystemPrompt', () => {
  it('returns no-context prompt for empty results', () => {
    const prompt = promptService.buildSystemPrompt([]);
    expect(prompt).not.toContain('Context from knowledge base');
  });

  it('includes context with source labels for non-empty results', () => {
    const prompt = promptService.buildSystemPrompt([
      {
        documentId: 'doc-1',
        documentTitle: 'Test Doc',
        chunkIndex: 0,
        content: 'Some content here',
        score: 0.9,
      },
    ]);

    expect(prompt).toContain('Context from knowledge base');
    expect(prompt).toContain('[Source 1: Test Doc]');
    expect(prompt).toContain('Some content here');
  });
});
