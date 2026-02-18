export type CopyFormat = 'plain' | 'markdown';

const FENCED_CODE_BLOCK_PATTERN = /(^|\n)(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n\2(?=\n|$)/g;
const INLINE_CODE_PATTERN = /`([^`\n]+)`/g;

export function markdownToPlainText(markdown: string): string {
  if (!markdown.trim()) return '';

  let text = markdown.replace(/\r\n/g, '\n');

  text = text.replace(FENCED_CODE_BLOCK_PATTERN, (_, leading: string, __: string, code: string) => {
    return `${leading}${code.trimEnd()}\n`;
  });

  text = text.replace(/^ {0,3}#{1,6}\s+/gm, '');
  text = text.replace(/^ {0,3}>\s?/gm, '');
  text = text.replace(/^ {0,3}[-*_]{3,}\s*$/gm, '');
  text = text.replace(/^ {0,3}[-*+]\s+/gm, '• ');
  text = text.replace(/^ {0,3}(\d+)\.\s+/gm, '$1. ');

  text = text.replace(/!\[([^\]]*)]\(([^)]+)\)/g, '$1');
  text = text.replace(/\[([^\]]+)]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '$1 ($2)');
  text = text.replace(/\[([^\]]+)]\[[^\]]*]/g, '$1');
  text = text.replace(/^\s*\[[^\]]+]:\s+\S+.*$/gm, '');

  text = text.replace(INLINE_CODE_PATTERN, '$1');
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/\*([^*\n]+)\*/g, '$1');
  text = text.replace(/_([^_\n]+)_/g, '$1');
  text = text.replace(/~~([^~]+)~~/g, '$1');

  text = text.replace(/^ {0,3}\|(.+)\|\s*$/gm, (_, row: string) => {
    return row
      .split('|')
      .map((cell) => cell.trim())
      .join(' | ');
  });
  text = text.replace(/^ {0,3}\|?[-:\s|]+\|?\s*$/gm, '');

  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/?(?:p|div|h[1-6]|li|ul|ol|blockquote|pre|table|tr|td|th)>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');

  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

export async function copyMessageToClipboard(content: string, format: CopyFormat): Promise<void> {
  const textToCopy = format === 'plain' ? markdownToPlainText(content) : content;
  await navigator.clipboard.writeText(textToCopy || content);
}
