# 聊天沉淀知识库问题清单（2026-03-04）

## 1. 背景

本清单整理了 2026 年 3 月 4 日围绕“聊天记录沉淀为知识库文档”讨论中确认的关键问题，分为两类：

- 需求确认项：需要产品口径固定，避免后续反复
- 缺陷/能力缺口：当前实现与期望不一致，需要代码修复

---

## 2. 需求确认项（口径）

### RQ-001 导出“完整聊天记录”时，是否展示用户提问

- 结论：应展示（默认）
- 原因：不展示用户提问会导致 AI 回复失去上下文，降低可读性与可追溯性。
- 当前实现：已展示
  - 证据：`packages/client/src/pages/ChatPage.tsx:62`、`:73`

### RQ-002 导出“完整聊天记录”时，是否展示消息时间

- 结论：应展示（建议默认显示每条消息时间）
- 当前实现：已展示，但时间格式为 ISO UTC（`toISOString()`）
  - 证据：`packages/client/src/pages/ChatPage.tsx:75`
- 风险提示：UTC 时间对最终用户不直观，建议明确是否需要本地时区显示（如 `Asia/Shanghai`）或保留 UTC。

---

## 3. 缺陷与能力缺口

### BUG-001 “创建完成后切换到该知识库”与实际行为不一致

- 严重级别：P1
- 现象：
  - 用户期望：在当前聊天上下文切换到新知识库，而不是开启新聊天。
  - 当前行为：创建完成后会清空当前会话消息并进入新会话状态。
- 代码证据：
  - 显式开启新会话：`packages/client/src/pages/ChatPage.tsx:397`（`startNewConversation()`）
  - 切换知识库时会清空消息与 `conversationId`：`packages/client/src/stores/chatPanelStore.ts:102`
  - 文案存在歧义：`packages/client/public/locales/zh-CN/chat.json:120`
- 影响：
  - 与用户心智冲突，用户会认为“当前聊天被打断/丢失”。
  - 复盘与连续追问体验变差。
- 验收标准：
  - 勾选“创建后切换”后，不应隐式新建会话。
  - 若产品定义为“保留现有消息”，需保证消息列表不被清空。
  - 文案明确说明行为边界（是否保留会话、是否保留消息）。

### GAP-001 聊天沉淀流程无法追加到“已有知识库”

- 严重级别：P1
- 现象：
  - 当前“沉淀为知识库”流程仅支持“新建知识库 + 上传文档”，不支持选择已有知识库追加。
- 代码证据：
  - 聊天页流程强制新建：`packages/client/src/pages/ChatPage.tsx:372`
  - 上传目标固定为新建知识库：`packages/client/src/pages/ChatPage.tsx:392`
- 对照能力（系统其实支持追加）：
  - 前端 API 已支持上传到指定 KB：`packages/client/src/api/knowledge-bases.ts:83`
  - 后端路由已支持 `POST /api/knowledge-bases/:id/documents`：
    `packages/server/src/modules/knowledge-base/knowledge-base.routes.ts:134`
- 影响：
  - 用户无法把 AI 产出持续沉淀到既有知识库，导致知识分散和重复创建 KB。
- 验收标准：
  - 聊天沉淀弹窗支持选择“新建知识库 / 追加到已有知识库”。
  - 选择“追加到已有知识库”时，文档应上传到目标 KB，且 KB 文档数正确增加。
  - 失败时给出明确错误提示（权限、文件校验、上传失败等）。

### GAP-002 若要求“在同一会话内切换 KB”，当前后端契约不足

- 严重级别：P2（设计/接口缺口）
- 现象：
  - 会话与 `knowledgeBaseId` 绑定；当前更新会话接口仅支持更新 `title`，不支持更新 `knowledgeBaseId`。
- 代码证据：
  - `updateConversationSchema` 仅有 `title`：`packages/shared/src/schemas/chat.ts:8`
  - 更新会话仅调用 `updateTitle`：`packages/server/src/modules/chat/controllers/conversation.controller.ts:81`
  - 服务层仅实现改标题：`packages/server/src/modules/chat/services/conversation.service.ts:117`
- 影响：
  - 若要严格满足“同一 conversationId 下切换 KB”，当前接口无法直接支持。
- 建议：
  - 先由产品明确“切换 KB”是否允许会话跨 KB。
  - 若允许，需扩展会话更新契约，支持更新 `knowledgeBaseId`，并定义历史消息检索语义。

### GAP-003 AI 目前不能直接“修改并保存”当前知识库中的文档

- 严重级别：P1
- 现象：
  - 用户期望：AI 对当前 KB 的已有文档进行改写后可直接落库（形成新版本）。
  - 当前行为：`document-ai` 的 `expand`/`streamExpand` 仅返回生成文本，不会写回文档。
- 代码证据：
  - AI 扩写仅生成返回：`packages/server/src/modules/document-ai/services/generation.service.ts:261`、`:303`
  - 控制器仅透传结果：`packages/server/src/modules/document-ai/controllers/generation.controller.ts:90`
  - 前端未打通 document-ai 到文档落库链路：`packages/client/src/api/document-ai.ts:105`
  - 当前可落库编辑能力来自手动编辑保存：`packages/client/src/pages/documents/DocumentDetailPage.tsx:88`
  - 保存接口仅支持 `markdown/text`：`packages/server/src/modules/document/services/document-content.service.ts:105`、`:109`
- 影响：
  - AI 改写无法形成知识库内可检索的新版本，用户需要手工复制粘贴，流程割裂。
  - 对 `pdf/docx` 文档无直接 AI 改写落库路径。
- 验收标准：
  - 文档详情页提供“AI 改写”入口（至少支持 `markdown/text`）。
  - AI 结果可“预览/确认”后保存为新版本，版本来源可区分（建议 `ai_generate`）。
  - 保存后触发重建索引流程，检索结果可命中新版本内容。
  - 对不可编辑类型（如 `pdf/docx`）给出明确引导（如“另存为新文档”或“上传新版本”）。

---

## 4. 建议排期顺序

1. 先修复 `GAP-001`（追加到已有知识库入口），这是用户感知最强的功能缺口。
2. 并行推进 `GAP-003`（AI 改写可落库），打通“生成 -> 沉淀”闭环。
3. 再处理 `BUG-001`（切换行为与文案不一致），避免持续误导。
4. 最后评估 `GAP-002`（会话跨 KB 契约），属于设计层改造，需先定产品语义。
