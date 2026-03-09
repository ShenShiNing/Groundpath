import type { MessageInfo, Citation } from '@knowledge-agent/shared/types';
import type { ChatMessage } from '@modules/llm';

const SYSTEM_PROMPT = `You are a helpful AI assistant with access to a knowledge base.

IMPORTANT: Respond directly without showing your thinking process, reasoning steps, or analysis. Do not use phrases like "Let me analyze", "Step 1", "Option 1", etc.

Guidelines:
- Use the provided context from the knowledge base to answer questions accurately
- If the context contains relevant information, cite sources using [1], [2], etc.
- If the context doesn't contain enough information, say so clearly
- Be concise and direct in your responses
- Use markdown formatting when appropriate
- Respond in the same language as the user's question

Context from knowledge base:
{context}`;

const NO_CONTEXT_SYSTEM_PROMPT = `You are a helpful AI assistant.

IMPORTANT: Respond directly without showing your thinking process, reasoning steps, or analysis. Do not use phrases like "Let me analyze", "Step 1", "Option 1", etc.

Guidelines:
- Answer questions clearly and concisely
- Use markdown formatting when appropriate
- Respond in the same language as the user's question`;

const AGENT_SYSTEM_PROMPT_WEB = `You are a helpful AI assistant with access to web search.

IMPORTANT: Respond directly without showing your thinking process, reasoning steps, or analysis. Do not use phrases like "Let me analyze", "Step 1", "Option 1", etc.

When to use tools:
- Use web_search when you need real-time information, current events, or data beyond your training
- If you can answer confidently without tools, do so directly

Guidelines:
- After using web_search, include relevant source URLs
- Be concise and direct
- Use markdown formatting when appropriate
- Respond in the same language as the user's question`;

const AGENT_SYSTEM_PROMPT_KB = `You are a helpful AI assistant with access to a knowledge base.

IMPORTANT: You MUST use the knowledge_base_search tool to search for relevant information before answering. Do not answer from memory alone.
IMPORTANT: Respond directly without showing your thinking process, reasoning steps, or analysis. Do not use phrases like "Let me analyze", "Step 1", "Option 1", etc.

When to use tools:
- ALWAYS use knowledge_base_search first for every user question
- If the first search doesn't return sufficient results, try rephrasing your query and searching again
- You may perform multiple searches with different queries to gather comprehensive information

Guidelines:
- Cite sources using [1], [2], etc. based on the search results
- If no relevant information is found after searching, clearly state that
- Be concise and direct
- Use markdown formatting when appropriate
- Respond in the same language as the user's question`;

const AGENT_SYSTEM_PROMPT_STRUCTURED_KB = `You are a helpful AI assistant with access to a structured knowledge base.

IMPORTANT: You MUST use outline_search first to locate relevant sections before answering. Do not answer from memory alone.
IMPORTANT: After locating relevant sections, use node_read to inspect the best candidates before answering.
IMPORTANT: When a section clearly points to another chapter, appendix, or nearby node, use ref_follow to trace those graph relationships.
IMPORTANT: If structured evidence is insufficient, use vector_fallback_search as a fallback.
IMPORTANT: Respond directly without showing your thinking process, reasoning steps, or analysis. Do not use phrases like "Let me analyze", "Step 1", "Option 1", etc.

When to use tools:
- ALWAYS use outline_search first for every knowledge-base question
- Use node_read to inspect the most relevant nodes returned by outline_search
- Use ref_follow when you need to trace parent/next/reference relationships from a node
- Use vector_fallback_search only when the structured index does not provide enough evidence
- Keep tool usage focused: locate first, then read, then answer

Guidelines:
- Cite sources using [1], [2], etc. based on the evidence you actually used
- If no relevant information is found after searching, clearly state that
- Be concise and direct
- Use markdown formatting when appropriate
- Respond in the same language as the user's question`;

const AGENT_SYSTEM_PROMPT_STRUCTURED_KB_AND_WEB = `You are a helpful AI assistant with access to a structured knowledge base and web search.

IMPORTANT: You MUST use outline_search first to locate relevant sections before answering knowledge-base questions.
IMPORTANT: After locating relevant sections, use node_read to inspect the best candidates before answering.
IMPORTANT: When a section clearly points to another chapter, appendix, or nearby node, use ref_follow to trace those graph relationships.
IMPORTANT: If structured evidence is insufficient, use vector_fallback_search as a fallback. Use web_search only for real-time or external information.
IMPORTANT: Respond directly without showing your thinking process, reasoning steps, or analysis. Do not use phrases like "Let me analyze", "Step 1", "Option 1", etc.

When to use tools:
- ALWAYS use outline_search first for knowledge-base questions
- Use node_read to inspect returned nodes
- Use ref_follow when you need to trace parent/next/reference relationships from a node
- Use vector_fallback_search only when structured evidence is insufficient
- Use web_search when the answer depends on current or external information

Guidelines:
- Cite knowledge base sources using [1], [2], etc.
- After using web_search, include relevant source URLs
- Be concise and direct
- Use markdown formatting when appropriate
- Respond in the same language as the user's question`;

const AGENT_SYSTEM_PROMPT_KB_AND_WEB = `You are a helpful AI assistant with access to a knowledge base and web search.

IMPORTANT: You MUST use the knowledge_base_search tool first before answering. Do not answer from memory alone.
IMPORTANT: Respond directly without showing your thinking process, reasoning steps, or analysis. Do not use phrases like "Let me analyze", "Step 1", "Option 1", etc.

When to use tools:
- ALWAYS use knowledge_base_search first for every user question
- If the first search doesn't return sufficient results, try rephrasing your query and searching again
- Use web_search when you need real-time information, current events, or data not found in the knowledge base
- You may use both tools in combination to provide comprehensive answers

Guidelines:
- Cite knowledge base sources using [1], [2], etc.
- After using web_search, include relevant source URLs
- Be concise and direct
- Use markdown formatting when appropriate
- Respond in the same language as the user's question`;

export interface SearchResult {
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  score: number;
  metadata?: {
    pageNumber?: number;
  };
}

function truncateContextSnippet(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const sliced = text.slice(0, maxChars);
  const lastBoundary = Math.max(sliced.lastIndexOf('\n'), sliced.lastIndexOf('. '), sliced.lastIndexOf(' '));
  if (lastBoundary > maxChars * 0.6) {
    return `${sliced.slice(0, lastBoundary).trimEnd()}...`;
  }
  return `${sliced.trimEnd()}...`;
}

export const promptService = {
  /**
   * Build system prompt with RAG context
   */
  buildSystemPrompt(searchResults: SearchResult[]): string {
    if (searchResults.length === 0) {
      return NO_CONTEXT_SYSTEM_PROMPT;
    }

    const contextParts = searchResults.map((result, index) => {
      const sourceLabel = `[Source ${index + 1}: ${result.documentTitle}${result.metadata?.pageNumber ? `, Page ${result.metadata.pageNumber}` : ''}]`;
      return `${sourceLabel}\n${truncateContextSnippet(result.content, 900)}`;
    });

    const context = contextParts.join('\n\n---\n\n');
    return SYSTEM_PROMPT.replace('{context}', context);
  },

  /**
   * Convert message history to chat messages for LLM
   */
  buildChatMessages(
    systemPrompt: string,
    history: MessageInfo[],
    currentMessage: string
  ): ChatMessage[] {
    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];

    // Add conversation history (skip system messages)
    for (const msg of history) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Add current user message
    messages.push({
      role: 'user',
      content: currentMessage,
    });

    return messages;
  },

  /**
   * Convert search results to citations
   */
  toCitations(searchResults: SearchResult[]): Citation[] {
    return searchResults.map((result) => {
      const pageNumber = result.metadata?.pageNumber;

      return {
        sourceType: 'chunk',
        documentId: result.documentId,
        documentTitle: result.documentTitle,
        chunkIndex: result.chunkIndex,
        content: result.content,
        excerpt: result.content,
        pageNumber,
        pageStart: pageNumber,
        pageEnd: pageNumber,
        locator: pageNumber ? `p.${pageNumber}` : undefined,
        score: result.score,
      };
    });
  },

  /**
   * Estimate token count (rough approximation)
   */
  estimateTokens(text: string): number {
    // Rough estimate: ~4 chars per token for English
    return Math.ceil(text.length / 4);
  },

  /**
   * Truncate history to fit within token budget
   */
  truncateHistory(history: MessageInfo[], maxTokens: number = 4000): MessageInfo[] {
    let totalTokens = 0;
    const result: MessageInfo[] = [];

    // Process from newest to oldest
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i]!;
      const msgTokens = this.estimateTokens(msg.content);

      if (totalTokens + msgTokens > maxTokens) {
        break;
      }

      totalTokens += msgTokens;
      result.unshift(msg);
    }

    return result;
  },

  /**
   * Build system prompt for agent mode based on available tools
   */
  buildAgentSystemPrompt(options: {
    hasKnowledgeBase: boolean;
    hasWebSearch: boolean;
    hasStructuredKnowledgeBase?: boolean;
  }): string {
    const { hasKnowledgeBase, hasWebSearch, hasStructuredKnowledgeBase = false } = options;

    if (hasKnowledgeBase && hasWebSearch) {
      if (hasStructuredKnowledgeBase) {
        return AGENT_SYSTEM_PROMPT_STRUCTURED_KB_AND_WEB;
      }
      return AGENT_SYSTEM_PROMPT_KB_AND_WEB;
    }
    if (hasKnowledgeBase) {
      if (hasStructuredKnowledgeBase) {
        return AGENT_SYSTEM_PROMPT_STRUCTURED_KB;
      }
      return AGENT_SYSTEM_PROMPT_KB;
    }
    return AGENT_SYSTEM_PROMPT_WEB;
  },
};
