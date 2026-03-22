/**
 * Summary Prompts
 * Prompt templates for document summarization
 */

import type { SummaryLength } from '@groundpath/shared/types';

interface SummaryPromptOptions {
  length: SummaryLength;
  language?: string;
  focusAreas?: string[];
}

const LENGTH_INSTRUCTIONS: Record<SummaryLength, string> = {
  short: '请提供一个简短的摘要，控制在100-200字左右。只包含最核心的要点。',
  medium: '请提供一个中等长度的摘要，控制在300-500字左右。涵盖主要内容和关键细节。',
  detailed: '请提供一个详细的摘要，控制在800-1200字左右。包含完整的内容概述、关键论点和重要细节。',
};

const LENGTH_INSTRUCTIONS_EN: Record<SummaryLength, string> = {
  short: 'Provide a brief summary of 100-200 words. Include only the most essential points.',
  medium: 'Provide a moderate summary of 300-500 words. Cover main content and key details.',
  detailed:
    'Provide a comprehensive summary of 800-1200 words. Include complete overview, key arguments, and important details.',
};

/**
 * Build summary system prompt
 */
export function buildSummarySystemPrompt(options: SummaryPromptOptions): string {
  const { length, language, focusAreas } = options;

  const isEnglish = language?.toLowerCase().includes('en');
  const lengthInstruction = isEnglish
    ? LENGTH_INSTRUCTIONS_EN[length]
    : LENGTH_INSTRUCTIONS[length];

  let prompt = isEnglish
    ? `You are a professional document summarization assistant. Your task is to generate accurate, well-structured summaries that capture the essence of the document.

${lengthInstruction}

Guidelines:
- Maintain objectivity and accuracy
- Preserve the original meaning and key information
- Use clear and concise language
- Organize information logically
- Do not add information not present in the original document`
    : `你是一个专业的文档摘要助手。你的任务是生成准确、结构清晰的摘要，准确捕捉文档的核心内容。

${lengthInstruction}

指导原则：
- 保持客观准确
- 保留原文的核心含义和关键信息
- 使用清晰简洁的语言
- 逻辑清晰地组织信息
- 不要添加原文中不存在的信息`;

  if (focusAreas && focusAreas.length > 0) {
    const focusText = focusAreas.join('、');
    prompt += isEnglish
      ? `\n\nFocus Areas: Please pay special attention to: ${focusText}`
      : `\n\n重点关注：请特别注意以下方面：${focusText}`;
  }

  return prompt;
}

/**
 * Build summary user prompt with document content
 */
export function buildSummaryUserPrompt(content: string, language?: string): string {
  const isEnglish = language?.toLowerCase().includes('en');

  return isEnglish
    ? `Please summarize the following document:\n\n---\n${content}\n---`
    : `请总结以下文档内容：\n\n---\n${content}\n---`;
}

/**
 * Build chunk summary prompt for long documents
 */
export function buildChunkSummaryPrompt(
  chunkIndex: number,
  totalChunks: number,
  language?: string
): string {
  const isEnglish = language?.toLowerCase().includes('en');

  return isEnglish
    ? `This is part ${chunkIndex + 1} of ${totalChunks} of a long document. Summarize this section, focusing on key points that should be included in the final summary.`
    : `这是一篇长文档的第 ${chunkIndex + 1} 部分（共 ${totalChunks} 部分）。请总结此部分的要点，重点关注应包含在最终摘要中的关键信息。`;
}

/**
 * Build merge summaries prompt
 */
export function buildMergeSummariesPrompt(options: SummaryPromptOptions): string {
  const { length, language, focusAreas } = options;
  const isEnglish = language?.toLowerCase().includes('en');
  const lengthInstruction = isEnglish
    ? LENGTH_INSTRUCTIONS_EN[length]
    : LENGTH_INSTRUCTIONS[length];

  let prompt = isEnglish
    ? `You are merging multiple section summaries into a single cohesive summary.

${lengthInstruction}

Instructions:
- Combine the section summaries into a unified, coherent summary
- Remove redundancy while preserving all important information
- Ensure logical flow and proper structure
- The final summary should read as a standalone document summary`
    : `你需要将多个章节摘要合并成一个完整的摘要。

${lengthInstruction}

指导原则：
- 将各章节摘要整合成统一、连贯的摘要
- 去除重复内容，同时保留所有重要信息
- 确保逻辑流畅和结构合理
- 最终摘要应该能够作为独立的文档摘要`;

  if (focusAreas && focusAreas.length > 0) {
    const focusText = focusAreas.join('、');
    prompt += isEnglish ? `\n\nFocus Areas: ${focusText}` : `\n\n重点关注：${focusText}`;
  }

  return prompt;
}

/**
 * Build merge user prompt with section summaries
 */
export function buildMergeUserPrompt(sectionSummaries: string[], language?: string): string {
  const isEnglish = language?.toLowerCase().includes('en');
  const summariesText = sectionSummaries
    .map((s, i) => `### ${isEnglish ? 'Section' : '章节'} ${i + 1}\n${s}`)
    .join('\n\n');

  return isEnglish
    ? `Please merge the following section summaries into a single cohesive summary:\n\n${summariesText}`
    : `请将以下章节摘要合并成一个完整的摘要：\n\n${summariesText}`;
}
