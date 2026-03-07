import { describe, expect, it } from 'vitest';
import {
  buildConversationMarkdownForKnowledgeSeed,
  sanitizeMessageContentForKnowledgeSeed,
} from '@/lib/chat';

const FIXED_TIME = new Date('2026-01-02T03:04:05.000Z');

describe('seedContent', () => {
  it('removes embedded KB search payloads from assistant content', () => {
    const kbPayload =
      '[Source 1: Employee Handbook]\nVacation policy details.\n\n---\n\n[Source 2: HR FAQ]\nCarry-over rules.';
    const cleaned = sanitizeMessageContentForKnowledgeSeed({
      role: 'assistant',
      timestamp: FIXED_TIME,
      content: `以下是结论：\n\n${kbPayload}\n\n建议按 handbook 执行。`,
      toolSteps: [
        {
          toolCalls: [{ name: 'knowledge_base_search' }],
          toolResults: [{ content: kbPayload }],
        },
      ],
    });

    expect(cleaned).toContain('以下是结论');
    expect(cleaned).toContain('建议按 handbook 执行。');
    expect(cleaned).not.toContain('[Source 1:');
    expect(cleaned).not.toContain('Carry-over rules.');
  });

  it('removes embedded web search blocks', () => {
    const webPayload =
      '[1] Release Note\nURL: https://example.com/release\nVersion 2.0 is now available.';
    const cleaned = sanitizeMessageContentForKnowledgeSeed({
      role: 'assistant',
      timestamp: FIXED_TIME,
      content: `搜索结果如下：\n\n${webPayload}\n\n建议先灰度发布。`,
      toolSteps: [
        {
          toolCalls: [{ name: 'web_search' }],
          toolResults: [{ content: webPayload }],
        },
      ],
    });

    expect(cleaned).toContain('建议先灰度发布。');
    expect(cleaned).not.toContain('https://example.com/release');
    expect(cleaned).not.toContain('搜索结果如下');
  });

  it('drops citation markers when exporting', () => {
    const cleaned = sanitizeMessageContentForKnowledgeSeed({
      role: 'assistant',
      timestamp: FIXED_TIME,
      content: '结论见[1]，详情见[2](#citation-2)。',
      citations: [{ content: 'A' }, { content: 'B' }],
    });

    expect(cleaned).not.toContain('[1]');
    expect(cleaned).not.toContain('#citation-2');
  });

  it('builds transcript with sanitized message bodies', () => {
    const transcript = buildConversationMarkdownForKnowledgeSeed(
      [
        {
          role: 'user',
          timestamp: FIXED_TIME,
          content: '请总结这周进展。',
        },
        {
          role: 'assistant',
          timestamp: FIXED_TIME,
          content: '结果如下[1]\n\n[1] Weekly Report\nURL: https://example.com/week\nrelease done',
          citations: [{ content: 'weekly report' }],
          toolSteps: [
            {
              toolCalls: [{ name: 'web_search' }],
              toolResults: [
                {
                  content: '[1] Weekly Report\nURL: https://example.com/week\nrelease done',
                },
              ],
            },
          ],
        },
      ],
      {
        transcript: '聊天记录',
        user: '用户',
        assistant: '助手',
      }
    );

    expect(transcript).toContain('# 聊天记录');
    expect(transcript).toContain('## 用户 (2026-01-02T03:04:05.000Z)');
    expect(transcript).toContain('## 助手 (2026-01-02T03:04:05.000Z)');
    expect(transcript).toContain('结果如下');
    expect(transcript).not.toContain('URL:');
    expect(transcript).not.toContain('#citation-');
  });
});
