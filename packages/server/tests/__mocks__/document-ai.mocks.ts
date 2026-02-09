/**
 * Document AI Mock Data
 * Test fixtures for document AI tests
 */

// ==================== Shared Test Data ====================

export const mockUserId = 'user-123';
export const mockDocumentId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
export const mockKnowledgeBaseId = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

// Document content for testing
export const mockShortContent = `
# 人工智能简介

人工智能（AI）是计算机科学的一个分支，致力于创建能够执行通常需要人类智能的任务的系统。

## 主要应用领域

1. 自然语言处理
2. 计算机视觉
3. 机器学习

AI 技术正在改变我们的生活方式。
`;

export const mockLongContent = `
# 人工智能发展史

## 第一章：早期探索（1950-1970）

人工智能的概念可以追溯到 1950 年代。艾伦·图灵在 1950 年发表了著名的论文《计算机器与智能》，提出了图灵测试的概念。

### 1.1 达特茅斯会议

1956 年，达特茅斯会议正式确立了人工智能作为一个学科。会议参与者包括约翰·麦卡锡、马文·明斯基等先驱人物。

### 1.2 早期成就

- 1957 年：感知机的发明
- 1965 年：ELIZA 聊天程序
- 1969 年：第一个移动机器人 Shakey

## 第二章：AI 寒冬（1970-1980）

由于技术限制和过高的期望，AI 研究在这一时期经历了资金削减。

## 第三章：专家系统时代（1980-1990）

专家系统的兴起带来了 AI 的复兴。MYCIN、DENDRAL 等系统在医疗和化学领域取得了显著成功。

## 第四章：机器学习革命（2000-至今）

深度学习的突破彻底改变了 AI 领域。2012 年 AlexNet 在 ImageNet 比赛中的胜利标志着新时代的开始。

### 4.1 重大突破

- 2016 年：AlphaGo 战胜李世石
- 2020 年：GPT-3 展示强大的语言能力
- 2022 年：ChatGPT 引爆生成式 AI

### 4.2 当前应用

人工智能已经渗透到我们生活的方方面面：

1. 智能助手（Siri、Alexa）
2. 自动驾驶汽车
3. 医疗诊断
4. 金融风控
5. 内容推荐

## 结论

人工智能的发展历程充满了起伏，但其潜力是巨大的。随着技术的不断进步，AI 将继续改变我们的世界。
`.repeat(35); // Repeat to make it long enough (> 24000 chars for hierarchical summarization, ~28000 chars)

export const mockDocumentContent = {
  id: mockDocumentId,
  title: 'Test Document',
  fileName: 'test.md',
  documentType: 'markdown' as const,
  textContent: mockShortContent,
  currentVersion: 1,
  processingStatus: 'completed' as const,
  isEditable: true,
  isTruncated: false,
  storageUrl: null,
};

export const mockLongDocumentContent = {
  ...mockDocumentContent,
  textContent: mockLongContent,
};

export const mockEmptyDocumentContent = {
  ...mockDocumentContent,
  textContent: null,
};

// Mock LLM responses
export const mockSummaryResponse = `这是一篇关于人工智能的简介文档。文章介绍了人工智能的定义，即计算机科学的一个分支，旨在创建能够执行通常需要人类智能任务的系统。文章还列举了AI的三个主要应用领域：自然语言处理、计算机视觉和机器学习，并指出AI技术正在改变人们的生活方式。`;

export const mockKeywordsResponse = JSON.stringify({
  keywords: [
    { word: '人工智能', relevance: 0.95 },
    { word: '机器学习', relevance: 0.88 },
    { word: '自然语言处理', relevance: 0.85 },
    { word: '计算机视觉', relevance: 0.82 },
    { word: '计算机科学', relevance: 0.75 },
  ],
});

export const mockEntitiesResponse = JSON.stringify({
  entities: [
    { text: 'AI', type: 'other', confidence: 0.95, occurrences: 3 },
    { text: '人工智能', type: 'other', confidence: 0.92, occurrences: 2 },
  ],
});

export const mockTopicsResponse = JSON.stringify({
  topics: [
    { name: '人工智能概述', description: '介绍人工智能的基本概念和定义', confidence: 0.95 },
    { name: 'AI应用领域', description: '列举人工智能的主要应用方向', confidence: 0.88 },
  ],
});

export const mockGenerationResponse = `# 人工智能的未来展望

人工智能技术正在以前所未有的速度发展，其影响力已经渗透到社会的各个层面。

## 技术趋势

1. **多模态AI**：未来的AI系统将能够同时处理文本、图像、音频和视频。
2. **边缘计算**：AI将更多地在本地设备上运行，减少对云端的依赖。
3. **可解释性**：研究人员正在努力使AI决策过程更加透明。

## 社会影响

AI将继续改变工作方式、教育模式和医疗保健。我们需要在技术进步和伦理考量之间找到平衡。`;

export const mockExpandResponse = `

## 补充内容：AI伦理问题

随着人工智能技术的快速发展，相关的伦理问题也日益凸显：

1. **隐私保护**：AI系统需要大量数据训练，如何保护用户隐私是关键问题。
2. **算法偏见**：AI可能会学习并放大人类社会中的偏见。
3. **就业影响**：自动化可能导致某些工作岗位消失。

这些问题需要技术专家、政策制定者和公众共同参与讨论和解决。`;

// Mock search results for RAG
export const mockSearchResults = [
  {
    id: 'search-result-1',
    documentId: 'doc-ref-1',
    knowledgeBaseId: mockKnowledgeBaseId,
    chunkIndex: 0,
    content: '人工智能的定义是...',
    score: 0.92,
  },
  {
    id: 'search-result-2',
    documentId: 'doc-ref-2',
    knowledgeBaseId: mockKnowledgeBaseId,
    chunkIndex: 1,
    content: '机器学习是人工智能的一个子领域...',
    score: 0.85,
  },
];

// ==================== 日志辅助函数 ====================

export function logTestInfo(input: unknown, expected: unknown, actual: unknown) {
  console.log(`  测试输入：${JSON.stringify(input)}`);
  console.log(`  预期结果：${JSON.stringify(expected)}`);
  console.log(`  实际结果：${JSON.stringify(actual)}`);
}
