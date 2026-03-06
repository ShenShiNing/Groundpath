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

const AGENT_SYSTEM_PROMPT = `You are a helpful AI assistant with access to web search.

IMPORTANT: Respond directly without showing your thinking process, reasoning steps, or analysis. Do not use phrases like "Let me analyze", "Step 1", "Option 1", etc.

When to use tools:
- Use web_search when you need real-time information, current events, or data beyond what is provided
- If you can answer confidently without tools, do so directly

Guidelines:
- After using web_search, include relevant source URLs
- Be concise and direct
- Use markdown formatting when appropriate
- Respond in the same language as the user's question`;

const AGENT_SYSTEM_PROMPT_WITH_KB = `You are a helpful AI assistant with access to a knowledge base and web search.

IMPORTANT: Respond directly without showing your thinking process, reasoning steps, or analysis. Do not use phrases like "Let me analyze", "Step 1", "Option 1", etc.

When to use tools:
- Use web_search when you need real-time information, current events, or data not covered by the knowledge base context below
- If the knowledge base context already contains sufficient information, answer directly without using tools

Guidelines:
- Cite knowledge base sources using [1], [2], etc.
- After using web_search, include relevant source URLs
- Be concise and direct
- Use markdown formatting when appropriate
- Respond in the same language as the user's question

Context from knowledge base:
{context}`;

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
      return `${sourceLabel}\n${result.content}`;
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
    return searchResults.map((result) => ({
      documentId: result.documentId,
      documentTitle: result.documentTitle,
      chunkIndex: result.chunkIndex,
      content: result.content,
      pageNumber: result.metadata?.pageNumber,
      score: result.score,
    }));
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
   * Build system prompt for agent mode (with tool access)
   * When searchResults are provided, KB context is embedded in the prompt.
   */
  buildAgentSystemPrompt(searchResults?: SearchResult[]): string {
    if (!searchResults || searchResults.length === 0) {
      return AGENT_SYSTEM_PROMPT;
    }

    const contextParts = searchResults.map((result, index) => {
      const sourceLabel = `[Source ${index + 1}: ${result.documentTitle}${result.metadata?.pageNumber ? `, Page ${result.metadata.pageNumber}` : ''}]`;
      return `${sourceLabel}\n${result.content}`;
    });

    const context = contextParts.join('\n\n---\n\n');
    return AGENT_SYSTEM_PROMPT_WITH_KB.replace('{context}', context);
  },
};
