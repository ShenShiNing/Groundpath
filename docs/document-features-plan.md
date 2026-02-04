# 文档阅读、编辑、AI 生成功能实现计划

## 概述

为 Knowledge Agent 项目实现三大文档功能：

1. **文档阅读** - 以可读方式查看文档内容（Markdown 渲染、文本排版）
2. **文档编辑** - 修改 Markdown/Text 文档内容，保存为新版本
3. **文档生成** - 使用 AI 生成或修改文档内容

## 现状分析

### 已有能力

- `document_versions.textContent` 字段存储提取的文本（最大 50KB）
- `document_versions.source` 已有 `'edit'` 和 `'ai_generate'` 枚举
- 完整的版本控制系统（upload → 新版本 → RAG 重处理）
- SSE 流式响应基础设施（`chat.service.ts` + `lib/sse.ts`）
- LLM 多提供商支持

### 缺失能力

- `DocumentViewer` 只有 PDF iframe 和纯文本 pre 标签，Markdown 无渲染
- 无获取文档内容的 API（当前 `getById` 不返回 `textContent`）
- 无保存编辑内容的 API
- 无 AI 生成文档的 API
- 前端无 Markdown 编辑器依赖

---

## 实现计划

### Phase 1: 文档阅读 (1-2 天)

#### 1.1 后端 API - 获取文档内容

**文件**: `packages/server/src/modules/document/`

**新增路由**: `GET /api/documents/:id/content`

```
document.routes.ts: 添加路由
document.controller.ts: 添加 getContent 方法
document.service.ts: 添加 getContent 方法
```

**返回数据**:

```typescript
{
  id: string;
  title: string;
  documentType: DocumentType;
  textContent: string | null;
  currentVersion: number;
  processingStatus: ProcessingStatus;
  isEditable: boolean; // markdown/text 可编辑
}
```

#### 1.2 前端依赖安装

```bash
pnpm -F @knowledge-agent/client add @uiw/react-md-editor rehype-sanitize
```

#### 1.3 前端组件 - DocumentReader

**文件**: `packages/client/src/components/documents/DocumentReader.tsx`

**功能**:

- Markdown: 使用 `MDEditor.Markdown` 渲染
- Text: 格式化文本显示（字体、行高、背景）
- PDF: iframe 嵌入
- DOCX: 显示提取的文本

#### 1.4 更新 DocumentDetailPage

**文件**: `packages/client/src/pages/documents/DocumentDetailPage.tsx`

**变更**:

- 调用新的 `getContent` API
- 使用 `DocumentReader` 替换 `DocumentViewer`
- 传递 `textContent` 给阅读器

#### 1.5 新增 Hooks

**文件**: `packages/client/src/hooks/useDocuments.ts`

```typescript
useDocumentContent(documentId: string)
```

---

### Phase 2: 文档编辑 (2-3 天)

#### 2.1 Shared Schema

**文件**: `packages/shared/src/schemas/document.ts`

```typescript
export const saveDocumentContentSchema = z.object({
  content: z.string().max(500000, 'Content too large'),
  changeNote: z.string().max(255).optional(),
});
```

#### 2.2 后端 API - 保存文档内容

**新增路由**: `PUT /api/documents/:id/content`

**文件**: `packages/server/src/modules/document/services/document.service.ts`

**新增方法**: `saveContent(documentId, userId, data, ctx?)`

**流程**:

1. 验证文档所有权
2. 验证文档类型（只允许 markdown/text）
3. 生成存储文件（新 storageKey）
4. 事务内：
   - 创建新版本（source='edit'）
   - 更新文档 currentVersion
   - 设置 processingStatus='pending'
5. 触发 RAG 重处理
6. 记录操作日志

#### 2.3 前端组件 - DocumentEditor

**文件**: `packages/client/src/components/documents/DocumentEditor.tsx`

**功能**:

- Markdown: 使用 `@uiw/react-md-editor`
- Text: 原生 textarea
- 工具栏：撤销、重做、保存
- 快捷键：Ctrl+S 保存
- 自动保存草稿到 localStorage（2秒防抖）
- 未保存状态提示

#### 2.4 更新 DocumentDetailPage

**变更**:

- 添加阅读/编辑模式切换（仅 markdown/text 显示）
- 编辑模式显示 `DocumentEditor`
- 保存后刷新版本历史

#### 2.5 新增 Hooks

**文件**: `packages/client/src/hooks/useDocuments.ts`

```typescript
useSaveDocumentContent();
```

---

### Phase 3: AI 生成 (2-3 天)

#### 3.1 Shared Schema 和类型

**文件**: `packages/shared/src/schemas/document.ts`

```typescript
export const aiGenerateDocumentSchema = z.object({
  mode: z.enum(['rewrite', 'expand', 'summarize', 'continue']),
  prompt: z.string().max(2000).optional(),
  selection: z
    .object({
      start: z.number().int().min(0),
      end: z.number().int().min(0),
    })
    .optional(),
  useRag: z.boolean().default(false),
});
```

**文件**: `packages/shared/src/types/document.ts`

```typescript
export type AIGenerateSSEEvent =
  | { type: 'chunk'; data: string }
  | { type: 'done'; data: { content: string; versionId: string } }
  | { type: 'error'; data: { code: string; message: string } };
```

#### 3.2 后端 API - AI 生成

**新增路由**: `POST /api/documents/:id/ai-generate` (SSE)

**文件**: `packages/server/src/modules/document/services/ai-document.service.ts`

**新增方法**: `generateWithSSE(res, options)`

**流程**:

1. 设置 SSE headers
2. 获取文档和当前内容
3. 根据 mode 构建 system prompt
4. 可选：RAG 检索知识库上下文
5. 调用 LLM 流式生成
6. 实时发送 chunk
7. 处理最终内容（替换选中部分/续写/完整替换）
8. 保存为新版本（source='ai_generate'）
9. 触发 RAG 重处理
10. 发送 done 事件

**Mode 说明**:

- `rewrite`: 重写选中/全部内容
- `expand`: 扩展内容，添加细节
- `summarize`: 总结精简
- `continue`: 续写文档

#### 3.3 前端组件 - AIAssistantPanel

**文件**: `packages/client/src/components/documents/AIAssistantPanel.tsx`

**功能**:

- 模式选择（重写/扩展/总结/续写）
- 附加指令输入
- 知识库上下文开关
- 生成中状态显示

#### 3.4 更新 DocumentEditor

**变更**:

- 添加 AI 辅助按钮到工具栏
- 集成 AIAssistantPanel
- 处理选中文本范围
- 流式显示生成内容

#### 3.5 前端 API 和 Hooks

**文件**: `packages/client/src/api/documents.ts`

```typescript
aiGenerateDocumentWithSSE(documentId, data, handlers, getAccessToken);
```

**文件**: `packages/client/src/hooks/useDocuments.ts`

```typescript
useAIGenerateDocument();
```

---

## 关键文件清单

### 后端需修改/新增

| 文件                                                                      | 操作                         |
| ------------------------------------------------------------------------- | ---------------------------- |
| `packages/server/src/modules/document/document.routes.ts`                 | 添加 3 个路由                |
| `packages/server/src/modules/document/controllers/document.controller.ts` | 添加 3 个方法                |
| `packages/server/src/modules/document/services/document.service.ts`       | 添加 getContent, saveContent |
| `packages/server/src/modules/document/services/ai-document.service.ts`    | 新建 - AI 生成服务           |
| `packages/server/src/modules/document/index.ts`                           | 导出新服务                   |

### 共享包需修改

| 文件                                      | 操作                                                     |
| ----------------------------------------- | -------------------------------------------------------- |
| `packages/shared/src/schemas/document.ts` | 添加 saveDocumentContentSchema, aiGenerateDocumentSchema |
| `packages/shared/src/types/document.ts`   | 添加 DocumentContentResponse, AIGenerateSSEEvent         |

### 前端需修改/新增

| 文件                                                            | 操作                                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/client/package.json`                                  | 添加 @uiw/react-md-editor, rehype-sanitize                             |
| `packages/client/src/components/documents/DocumentReader.tsx`   | 新建                                                                   |
| `packages/client/src/components/documents/DocumentEditor.tsx`   | 新建                                                                   |
| `packages/client/src/components/documents/AIAssistantPanel.tsx` | 新建                                                                   |
| `packages/client/src/components/documents/index.ts`             | 导出新组件                                                             |
| `packages/client/src/api/documents.ts`                          | 添加 getContent, saveContent, aiGenerate                               |
| `packages/client/src/hooks/useDocuments.ts`                     | 添加 useDocumentContent, useSaveDocumentContent, useAIGenerateDocument |
| `packages/client/src/lib/queryClient.ts`                        | 添加 content queryKey                                                  |
| `packages/client/src/pages/documents/DocumentDetailPage.tsx`    | 重构支持阅读/编辑模式                                                  |

---

## 验证计划

### Phase 1 验证

1. 访问 `/documents/:id`，验证 Markdown 渲染效果
2. 验证 Text 文档格式化显示
3. 验证 PDF 仍能正常预览
4. 验证 DOCX 显示提取文本

### Phase 2 验证

1. 点击编辑按钮，验证编辑器加载
2. 修改内容，验证未保存状态显示
3. Ctrl+S 保存，验证新版本创建
4. 刷新页面，验证草稿恢复
5. 查看版本历史，验证 source='edit'

### Phase 3 验证

1. 选中文本，点击 AI 辅助
2. 选择"重写"模式，验证流式生成
3. 验证生成内容替换选中部分
4. 使用"续写"模式，验证内容追加
5. 开启 RAG 上下文，验证引用知识库
6. 查看版本历史，验证 source='ai_generate'

---

## 注意事项

1. **性能**: 大文件（>100KB）考虑分页加载或虚拟滚动
2. **安全**: Markdown 渲染使用 rehype-sanitize 防 XSS
3. **一致性**: 保存/AI 生成后触发 RAG 重处理
4. **错误处理**: SSE 中断需友好提示，保留已生成内容
5. **移动端**: 编辑器需响应式适配
