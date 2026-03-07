export interface KnowledgeSeedCitation {
  content: string;
}

export interface KnowledgeSeedToolCall {
  name: string;
}

export interface KnowledgeSeedToolResult {
  content: string;
}

export interface KnowledgeSeedToolStep {
  toolCalls: KnowledgeSeedToolCall[];
  toolResults?: KnowledgeSeedToolResult[];
}

export interface KnowledgeSeedMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  citations?: KnowledgeSeedCitation[];
  toolSteps?: KnowledgeSeedToolStep[];
}

interface ConversationLabels {
  transcript: string;
  user: string;
  assistant: string;
}

const SEARCH_TOOL_NAMES = new Set(['knowledge_base_search', 'web_search']);

const CITATION_LINK_PATTERN = /\[(\d+)]\(#citation-\1\)/g;
const SOURCE_HEADER_LINE_PATTERN =
  /(?:^|\n)\s*(?:search results?|搜索结果(?:如下)?|检索结果(?:如下)?)\s*[:：]?\s*\n/gi;
const KB_SOURCE_BLOCK_PATTERN =
  /(?:^|\n)\[Source\s+\d+:[^\]]+][\s\S]*?(?=\n{2,}---\n{2,}|\n{2,}\[Source\s+\d+:|$)/gi;
const WEB_SOURCE_BLOCK_PATTERN =
  /(?:^|\n)\[\d+][^\n]*\nURL:\s*https?:\/\/[^\n]+[\s\S]*?(?=\n{2,}---\n{2,}|\n{2,}\[\d+]|$)/gi;

function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function uniqueToolResultContents(toolSteps?: KnowledgeSeedToolStep[]): string[] {
  const results = new Set<string>();
  for (const step of toolSteps ?? []) {
    for (const toolResult of step.toolResults ?? []) {
      const value = toolResult.content.trim();
      if (value.length >= 30) {
        results.add(value);
      }
    }
  }
  return [...results].sort((a, b) => b.length - a.length);
}

function hasSearchToolTrace(toolSteps?: KnowledgeSeedToolStep[]): boolean {
  for (const step of toolSteps ?? []) {
    for (const call of step.toolCalls ?? []) {
      if (SEARCH_TOOL_NAMES.has(call.name)) {
        return true;
      }
    }
  }
  return false;
}

function stripCitationMarkers(text: string, citationCount: number): string {
  let result = text.replace(CITATION_LINK_PATTERN, '');
  if (citationCount <= 0) {
    return result;
  }

  result = result.replace(/\[(\d+)]/g, (full, rawIndex: string) => {
    const index = Number(rawIndex);
    if (Number.isInteger(index) && index >= 1 && index <= citationCount) {
      return '';
    }
    return full;
  });

  return result;
}

function normalizeMarkdownSpacing(text: string): string {
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sanitizeMessageContentForKnowledgeSeed(message: KnowledgeSeedMessage): string {
  let content = normalizeLineBreaks(message.content);

  // Remove exact tool payloads if they leaked into assistant content.
  for (const toolPayload of uniqueToolResultContents(message.toolSteps)) {
    if (content.includes(toolPayload)) {
      content = content.split(toolPayload).join('');
    }
  }

  if (hasSearchToolTrace(message.toolSteps)) {
    content = content.replace(SOURCE_HEADER_LINE_PATTERN, '\n');
    content = content.replace(KB_SOURCE_BLOCK_PATTERN, '\n');
    content = content.replace(WEB_SOURCE_BLOCK_PATTERN, '\n');
  }

  content = stripCitationMarkers(content, message.citations?.length ?? 0);
  return normalizeMarkdownSpacing(content);
}

export function buildConversationMarkdownForKnowledgeSeed(
  messages: KnowledgeSeedMessage[],
  labels: ConversationLabels
): string {
  const sections = messages
    .map((message) => {
      const cleanedContent = sanitizeMessageContentForKnowledgeSeed(message);
      if (!cleanedContent) return null;
      const roleTitle = message.role === 'user' ? labels.user : labels.assistant;
      const time = message.timestamp.toISOString();
      return `## ${roleTitle} (${time})\n\n${cleanedContent}`;
    })
    .filter((section): section is string => section !== null);

  const body = sections.join('\n\n');
  return `# ${labels.transcript}\n\n${body}`.trim();
}
