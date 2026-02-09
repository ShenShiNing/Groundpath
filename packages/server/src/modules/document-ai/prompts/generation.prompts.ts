/**
 * Generation Prompts
 * Prompt templates for document generation and expansion
 */

import type { GenerationTemplate, GenerationStyle } from '@knowledge-agent/shared/types';

interface GenerationPromptOptions {
  template?: GenerationTemplate;
  style?: GenerationStyle;
  language?: string;
  maxLength?: number;
}

interface ExpandPromptOptions {
  position: 'before' | 'after' | 'replace';
  style?: GenerationStyle;
  language?: string;
  maxLength?: number;
}

const STYLE_INSTRUCTIONS: Record<GenerationStyle, { en: string; zh: string }> = {
  formal: {
    en: 'Use formal, professional language appropriate for business or academic contexts.',
    zh: '使用正式、专业的语言，适合商务或学术场合。',
  },
  casual: {
    en: 'Use friendly, conversational language that is easy to read and approachable.',
    zh: '使用友好、对话式的语言，易于阅读且平易近人。',
  },
  technical: {
    en: 'Use precise technical language with appropriate terminology for expert audiences.',
    zh: '使用精确的技术语言和适当的专业术语，面向专业读者。',
  },
  creative: {
    en: 'Use engaging, creative language with vivid descriptions and varied sentence structures.',
    zh: '使用引人入胜的创意语言，包含生动的描述和多样的句式。',
  },
  academic: {
    en: 'Use scholarly language with proper citations style and formal structure.',
    zh: '使用学术语言，采用规范的引用风格和正式的结构。',
  },
};

const TEMPLATE_INSTRUCTIONS: Record<GenerationTemplate, { en: string; zh: string }> = {
  report: {
    en: 'Structure the content as a professional report with clear sections, executive summary, findings, and conclusions.',
    zh: '将内容组织成专业报告，包含清晰的章节、执行摘要、调查结果和结论。',
  },
  email: {
    en: 'Format as a well-structured email with greeting, clear body paragraphs, and appropriate closing.',
    zh: '格式化为结构良好的邮件，包含问候语、清晰的正文段落和适当的结尾。',
  },
  article: {
    en: 'Write as an engaging article with a compelling introduction, informative body, and strong conclusion.',
    zh: '撰写为引人入胜的文章，包含吸引人的引言、内容丰富的正文和有力的结论。',
  },
  outline: {
    en: 'Create a hierarchical outline with main topics, subtopics, and key points in bullet format.',
    zh: '创建层次化的大纲，包含主题、子主题和要点，使用项目符号格式。',
  },
  summary: {
    en: 'Provide a concise summary that captures the essential information in a structured format.',
    zh: '提供简洁的摘要，以结构化格式捕捉核心信息。',
  },
  custom: {
    en: 'Follow the specific instructions provided by the user.',
    zh: '按照用户提供的具体说明进行。',
  },
};

/**
 * Build generation system prompt
 */
export function buildGenerationSystemPrompt(options: GenerationPromptOptions = {}): string {
  const { template, style = 'formal', language, maxLength } = options;
  const isEnglish = language?.toLowerCase().includes('en');

  const styleInstruction = STYLE_INSTRUCTIONS[style];
  const templateInstruction = template ? TEMPLATE_INSTRUCTIONS[template] : null;

  let prompt = isEnglish
    ? `You are a professional content generation assistant. Generate high-quality, well-structured content based on the user's request.

Writing Style:
${styleInstruction.en}`
    : `你是一个专业的内容生成助手。根据用户的请求生成高质量、结构良好的内容。

写作风格：
${styleInstruction.zh}`;

  if (templateInstruction) {
    prompt += isEnglish
      ? `\n\nFormat:
${templateInstruction.en}`
      : `\n\n格式：
${templateInstruction.zh}`;
  }

  if (maxLength) {
    prompt += isEnglish
      ? `\n\nLength: Aim for approximately ${maxLength} characters.`
      : `\n\n长度：目标约 ${maxLength} 字符。`;
  }

  prompt += isEnglish
    ? `\n\nGuidelines:
- Generate original, high-quality content
- Maintain consistency in tone and style
- Ensure logical flow and coherence
- Use appropriate formatting for readability`
    : `\n\n指导原则：
- 生成原创、高质量的内容
- 保持语气和风格的一致性
- 确保逻辑流畅和连贯
- 使用适当的格式提高可读性`;

  return prompt;
}

/**
 * Build generation user prompt
 */
export function buildGenerationUserPrompt(
  prompt: string,
  context?: string,
  language?: string
): string {
  const isEnglish = language?.toLowerCase().includes('en');

  if (context) {
    return isEnglish
      ? `Reference Context:\n---\n${context}\n---\n\nUser Request:\n${prompt}`
      : `参考上下文：\n---\n${context}\n---\n\n用户请求：\n${prompt}`;
  }

  return prompt;
}

/**
 * Build expand system prompt
 */
export function buildExpandSystemPrompt(options: ExpandPromptOptions): string {
  const { position, style, language, maxLength } = options;
  const isEnglish = language?.toLowerCase().includes('en');

  const styleInstruction = style ? STYLE_INSTRUCTIONS[style] : null;

  const positionInstructions = {
    before: {
      en: 'Generate content that will be placed BEFORE the existing content. Ensure smooth transition into the existing text.',
      zh: '生成将放置在现有内容之前的内容。确保与现有文本的平滑过渡。',
    },
    after: {
      en: 'Generate content that will be placed AFTER the existing content. Continue naturally from where the document ends.',
      zh: '生成将放置在现有内容之后的内容。自然地延续文档结尾的内容。',
    },
    replace: {
      en: 'Generate content that will REPLACE the existing content entirely. Maintain the original intent while improving or expanding the content.',
      zh: '生成将完全替换现有内容的内容。在改进或扩展内容的同时保持原始意图。',
    },
  };

  let prompt = isEnglish
    ? `You are a document expansion assistant. Your task is to expand or enhance existing document content.

Position: ${positionInstructions[position].en}`
    : `你是一个文档扩展助手。你的任务是扩展或增强现有文档内容。

位置：${positionInstructions[position].zh}`;

  if (styleInstruction) {
    prompt += isEnglish
      ? `\n\nWriting Style:\n${styleInstruction.en}`
      : `\n\n写作风格：\n${styleInstruction.zh}`;
  }

  if (maxLength) {
    prompt += isEnglish
      ? `\n\nTarget Length: Approximately ${maxLength} characters for the new content.`
      : `\n\n目标长度：新内容约 ${maxLength} 字符。`;
  }

  prompt += isEnglish
    ? `\n\nGuidelines:
- Match the existing document's tone and style
- Ensure seamless integration with existing content
- Maintain logical flow and coherence
- Add value while respecting the original content`
    : `\n\n指导原则：
- 匹配现有文档的语气和风格
- 确保与现有内容的无缝集成
- 保持逻辑流畅和连贯
- 在尊重原始内容的同时增加价值`;

  return prompt;
}

/**
 * Build expand user prompt
 */
export function buildExpandUserPrompt(
  instruction: string,
  existingContent: string,
  context?: string,
  language?: string
): string {
  const isEnglish = language?.toLowerCase().includes('en');

  let prompt = isEnglish
    ? `Existing Document Content:\n---\n${existingContent}\n---\n\nExpansion Instruction:\n${instruction}`
    : `现有文档内容：\n---\n${existingContent}\n---\n\n扩展指令：\n${instruction}`;

  if (context) {
    prompt = isEnglish
      ? `Reference Context:\n---\n${context}\n---\n\n${prompt}`
      : `参考上下文：\n---\n${context}\n---\n\n${prompt}`;
  }

  return prompt;
}
