# 架构评审整改决议（2026-03-07）

## 1. 结论与决议

基于本次架构级 Code Review，针对开放问题确认如下：

1. `document processing` 从 API 进程中剥离，独立为 Worker 执行（确认）。
2. OpenAI/Zhipu 的 API Key 不复用；`embedding` 可配置能力保留（这是既定有意设计，确认）。
3. 在 CI 中引入依赖边界检查并作为质量门禁（确认）。

补充审查发现以下额外整改项：

4. Controller 输入验证层类型安全加固与 Schema 集中化（补充）。
5. 硬编码业务常量配置化治理（补充）。
6. 大函数/大文件拆分治理（补充）。
7. 测试覆盖结构性缺口补全（补充）。
8. 前端错误状态处理补全（补充）。

---

## 2. 决议落地目标

### 2.1 Document Processing 独立 Worker

目标：将文档分块、向量化、向量写入等重任务从请求链路移出，提升稳定性与可扩展性。

落地方向：

- API 仅负责入队与状态返回，不直接执行 `processingService.processDocument(...)`。
- Worker 进程消费队列任务，串联 chunking/embedding/vector/db 更新。
- 任务状态统一回写 `documents.processingStatus` 与 `processingError`。
- 引入任务重试、退避、死信队列与可观测指标（成功率/重试次数/耗时分位）。

验收标准：

- 上传、编辑、恢复、版本切换接口响应中不再执行重处理逻辑。
- Worker 宕机不影响 API 基础读写能力。
- 任务失败可重试且不破坏幂等与计数一致性。

### 2.2 LLM Key 与 Embedding Key 治理

目标：消除密钥复用带来的安全与职责耦合问题，同时保持 embedding 可配置策略。

落地方向：

- LLM Provider 仅使用 LLM 配置域的密钥（不回退到 embedding 配置）。
- Embedding Provider 继续支持按知识库可配置（provider/model/dimensions）。
- 配置模型分层：`llm.*` 与 `embedding.*` 明确隔离，避免跨域 fallback。
- 数据迁移策略：对历史配置做兼容读取与告警，分阶段移除旧 fallback 逻辑。

验收标准：

- `llm.factory` 不再读取 embedding 的 OpenAI/Zhipu key。
- 文档与环境变量模板明确区分两类密钥来源。
- 现有 embedding 可配置行为不回归。

### 2.3 CI 依赖边界检查

目标：把"架构边界"从约定升级为自动化门禁，防止循环依赖与跨层侵入回归。

落地方向：

- 引入依赖图检查工具（建议 `dependency-cruiser`，可配合 `madge` 做 cycle 快检）。
- 在 server 侧定义规则：
  - 禁止模块循环依赖（含 barrel 引入链路）。
  - `controllers` 不得直连 `repositories`（必须经 `services`）。
  - `routes` 不得跨模块直接 import 他模块 `controllers`。
  - 跨模块访问优先通过稳定的模块公开接口（必要时引入 application service/interface）。
- 在 CI 新增 `architecture:check` 步骤，失败即阻断合并。

验收标准：

- PR 中出现新增循环依赖时，CI 明确失败。
- 关键边界违规可在本地与 CI 稳定复现。
- 团队有文档化的"例外申请机制"（极少数场景临时放行需注明到期时间）。

### 2.4 Controller 输入验证层加固与 Schema 集中化

目标：消除 Controller 中 `as` 类型断言的隐患，统一 Schema 归属，使验证链路端到端类型安全。

#### 现状分析

`validateBody()` 中间件（`validation.middleware.ts:37`）已通过 `req.body = result.data` 将 Zod 验证后的数据回写 `req.body`，运行时数据是安全的。但 Controller 层使用 `req.body as XxxRequest` 类型断言获取数据，存在以下问题：

- **编译期无约束**：断言的 TS 类型与实际 Zod schema 输出类型之间没有编译期关联，schema 字段变更时 controller 不会报错。
- **模式不一致**：`body` 通过 `req.body` 获取，`query/params` 需要通过 `getValidatedQuery(res)` / `getValidatedParams(res)` 获取，两套模式混用。
- **Schema 分散**：RAG 搜索 schema 定义在 `rag.controller.ts:11-17` 的局部变量中，未提升至 `@knowledge-agent/shared/schemas`。

涉及文件：

| 文件                  | 行号       | 模式                                                                     |
| --------------------- | ---------- | ------------------------------------------------------------------------ |
| `auth.controller.ts`  | 53, 66, 78 | `req.body as RegisterRequest` / `LoginRequest` / `ChangePasswordRequest` |
| `auth.controller.ts`  | 105, 114   | `req.body as RegisterWithCodeRequest` / `ResetPasswordRequest`           |
| `oauth.controller.ts` | 78, 129    | `req.query.code as string` / `req.body as OAuthExchangeRequest`          |
| `email.controller.ts` | 16, 58     | `req.body as SendVerificationCodeRequest` / `VerifyCodeRequest`          |
| `rag.controller.ts`   | 11-17      | 局部定义 `searchSchema`，未提升至 shared                                 |

落地方向：

- 为 `validateBody` 提供泛型 helper（类似 `getValidatedQuery`），使 controller 通过类型安全的 helper 获取请求体，消除 `as` 断言：
  ```typescript
  // 方案：validateBody 验证后通过 res.locals 或 typed helper 获取
  const body = getValidatedBody<RegisterRequest>(res);
  ```
- `body` / `query` / `params` 统一使用 `res.locals.validated.*` + typed helper 的模式，保持一致。
- 将 `rag.controller.ts` 中的局部 `searchSchema` 提升至 `@knowledge-agent/shared/schemas/rag.ts`，并导出对应 TS 类型。

验收标准：

- 所有 Controller 中不再出现 `req.body as Xxx` / `req.query.xxx as string` 模式。
- 新增或变更 Schema 字段时，Controller 消费侧有编译期类型检查。
- RAG 搜索 schema 从 shared 导入，前后端共享同一定义。

### 2.5 硬编码业务常量配置化

目标：将散落在 Service 层的业务可调参数集中收归 `config/env.ts`，提供统一调优入口。

现状（已有良好的 config 基础设施，但以下参数游离在外）：

| 文件                           | 行号  | 常量                       | 值           | 说明                           |
| ------------------------------ | ----- | -------------------------- | ------------ | ------------------------------ |
| `summary.service.ts`           | 29    | `MAX_CONTEXT_TOKENS`       | 8000         | 摘要上下文窗口                 |
| `summary.service.ts`           | 30    | `CHARS_PER_TOKEN`          | 3            | Token 估算因子                 |
| `summary.service.ts`           | 31    | `BATCH_SIZE`               | 5            | 分层摘要批次大小               |
| `analysis.service.ts`          | 34    | `MAX_ANALYSIS_CHARS`       | 30000        | 分析上限字符数                 |
| `generation.service.ts`        | 92    | `limit`                    | 5            | RAG 检索结果数（4 处调用重复） |
| `generation.service.ts`        | 93    | `scoreThreshold`           | 0.5          | RAG 相关性阈值（4 处调用重复） |
| `chat.service.ts`              | 228   | `limit` / `scoreThreshold` | 5 / 0.5      | 与 generation 重复             |
| `processing.service.ts`        | 183   | `batchSize`                | 20           | 向量批处理大小                 |
| `document-ai-cache.service.ts` | 15-18 | TTL / 清理间隔             | 60min / 5min | 缓存参数                       |
| `document-ai-sse.service.ts`   | 12    | `HEARTBEAT_INTERVAL_MS`    | 15000        | SSE 心跳间隔                   |

落地方向：

- 在 `env.ts` 中新增 `documentAISchema` 配置段（`MAX_CONTEXT_TOKENS`、`BATCH_SIZE`、`MAX_ANALYSIS_CHARS` 等）。
- RAG 搜索默认参数（`limit`、`scoreThreshold`）归入 `ragSchema` 或复用已有的 `documentConfig`。
- 向量批处理大小、SSE 心跳间隔等归入对应已有 config 段。
- 同步更新 `.env.example` 文档化所有新增环境变量及其默认值。

验收标准：

- Service 层不再出现硬编码的数值常量（除纯算法常量外）。
- `generation.service.ts` 与 `chat.service.ts` 中的 `limit` / `scoreThreshold` 从同一个 config 源读取，不再各自硬编码。
- 新增环境变量在 `.env.example` 中有对应条目。

### 2.6 大函数/大文件拆分

目标：降低单文件/单函数复杂度，使核心逻辑可独立理解与测试（阈值：文件 ≤400 行，函数 ≤80 行）。

#### 后端

| 文件                     | 行数 | 拆分方向                                                                                                                                    |
| ------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat.service.ts`        | 437  | `sendMessageWithSSE()`（277 行）拆分为 `executeAgentMode()` + `executeLegacyRAGMode()` + `handleStreamError()`；SSE 流管理提取为独立 helper |
| `auth.service.ts`        | 421  | `login()`（~100 行）提取 `validateLoginAttempt()` + `recordLoginResult()`                                                                   |
| `analysis.service.ts`    | 414  | 与 `summary.service.ts`（403 行）、`generation.service.ts`（413 行）共享的 SSE 流处理模式提取为公共 helper                                  |
| `document.controller.ts` | 367  | 若含 inline 逻辑，提取到 service 层                                                                                                         |

#### 前端

| 文件                          | 行数 | 拆分方向                                                                                                        |
| ----------------------------- | ---- | --------------------------------------------------------------------------------------------------------------- |
| `ChatPage.tsx`                | 825  | 提取 `ChatKBSeedDialog`、`ChatDocUploadDialog`、`ChatHeader` 为独立组件；KB 创建逻辑提取为 `useKBCreation` hook |
| `KnowledgeBaseDetailPage.tsx` | 703  | 提取 `DocumentGrid` / `DocumentTable` 视图组件；删除/编辑逻辑提取为 custom hook                                 |
| `AISettingsForm.tsx`          | 629  | 按 Provider / Model / Credentials 拆分为三个子表单组件                                                          |
| `AppLayout.tsx`               | 565  | 提取 `Sidebar`、`UserMenu`、`NavBar` 为独立组件                                                                 |
| `KnowledgeBasesPage.tsx`      | 514  | 提取 `KBListContent`、`KBEmptyState`、`KBCreateCard`                                                            |
| `ForgotPasswordForm.tsx`      | 489  | 按步骤（发送验证码 / 验证 / 重置密码）拆分为子组件                                                              |
| `chatPanelStore.ts`           | 451  | `sendMessage()`（127 行）提取 `createConversationIfNeeded()` 和 SSE handler factory                             |

验收标准：

- 后端超过 400 行的 Service 文件数降为 0。
- `sendMessageWithSSE()` 拆分后，每个子函数 ≤80 行。
- 前端超过 500 行的页面/组件文件数降为 0。

### 2.7 测试覆盖补全

目标：消除核心模块的测试盲区，建立最低覆盖基线。

#### 现状统计

| 区域                  | 源文件数 | 测试文件数 | 覆盖评估                        |
| --------------------- | -------- | ---------- | ------------------------------- |
| server/auth           | —        | 13         | ✅ 全面                         |
| server/chat           | —        | 9          | ✅ 良好                         |
| server/document       | —        | 6          | ✅ 良好                         |
| server/knowledge-base | —        | 6          | ✅ 完整                         |
| server/document-ai    | —        | 8          | ✅ 较好                         |
| server/llm            | —        | 6          | ⚠️ 部分                         |
| server/rag            | —        | 3          | ⚠️ 部分（service 层未直接覆盖） |
| server/embedding      | —        | 2          | ⚠️ 轻度                         |
| server/vector         | —        | 2          | ⚠️ 轻度                         |
| server/storage        | —        | 3          | ⚠️ 轻度                         |
| server/logs           | —        | 2          | ⚠️ 轻度                         |
| server/user           | —        | 2          | ⚠️ 轻度                         |
| **server/agent**      | **6**    | **0**      | **❌ 零覆盖**                   |
| server/e2e            | —        | 4          | Smoke 级别                      |
| **client 整体**       | **166**  | **6**      | **❌ 严重不足（<4%）**          |
| shared                | —        | 1          | ⚠️ 仅工具函数                   |

落地方向：

**P0 — Agent 模块补测（零覆盖，风险最高）**：

- `agent-executor.ts`（176 行）：执行循环、迭代上限、工具编排、超时、错误处理。
- `kb-search.tool.ts`（81 行）：知识库检索、空结果、超时。
- `web-search.tool.ts`（107 行）：Tavily API 调用、失败降级。
- 目标：≥3 个测试文件，400-600 行测试代码。

**P1 — RAG Service 层补测**：

- `processing.service.ts`：分布式锁、幂等重处理、batch embedding、向量写入、失败回滚。
- `search.service.ts`：搜索参数传递、空结果、score 过滤。

**P1 — 客户端关键路径补测**：

- 页面级测试：`ChatPage`、`KnowledgeBaseDetailPage` 的核心交互流程。
- React Query hooks：验证 key factory 与 cache invalidation 行为。
- 目标：客户端测试文件数提升至 20+。

**P2 — 轻度覆盖模块加固**：

- embedding / vector / storage / logs / user 各模块补充 service 层单元测试。

验收标准：

- Agent 模块达到 ≥80% 行覆盖率。
- 客户端测试文件数 ≥20。
- 所有模块至少有 1 个 service 层测试文件。

### 2.8 前端错误状态处理补全

目标：所有 `useQuery` / `useMutation` 调用必须有用户可感知的错误反馈，消除沉默失败。

现状问题：

| 文件                          | 行号     | 问题                                                                                  |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------- |
| `KnowledgeBaseDetailPage.tsx` | 266-267  | `useKnowledgeBase()` / `useKBDocuments()` 未处理 `isError`，API 失败显示空白          |
| `DocumentDetailPage.tsx`      | 54-56    | `useDocument()` / `useDocumentContent()` / `useDocumentVersions()` 均未处理 `isError` |
| `ChatPage.tsx`                | 125-132  | `useKnowledgeBases()` / `useKBDocuments()` 未处理 `isError`                           |
| `AIRewriteDialog.tsx`         | 104-107  | `onError` 回调仅重置状态，未显示错误信息（沉默失败）                                  |
| `AIRewriteDialog.tsx`         | 139      | `saveContent()` 无 try-catch，失败直接冒泡且无提示                                    |
| `__root.tsx`                  | 20       | `ensureAccessToken().catch(() => {})` 完全吞掉错误，无日志无提示                      |
| `chatPanelStore.ts`           | 199, 275 | 错误消息硬编码中文，未走 i18n                                                         |

落地方向：

- **useQuery 错误统一处理**：在关键页面（DetailPage、ListPage）解构 `isError` / `error`，渲染通用的 `<ErrorState />` 组件或 `toast.error()`。
- **SSE 流错误反馈**：`AIRewriteDialog` 的 `onError` 回调补充 `toast.error()` 调用。
- **沉默 catch 治理**：`__root.tsx` 的 `.catch(() => {})` 至少加 `console.warn` 或走到 auth store 的退出逻辑。
- **错误消息 i18n**：`chatPanelStore.ts` 中硬编码的中文错误消息迁移至 i18n 翻译文件。
- **mutation 错误细化**：`catch` 块从通用文案改为根据错误类型展示具体消息。

验收标准：

- 所有页面级 `useQuery` 调用都处理 `isError`，有对应的错误 UI。
- 不存在 `.catch(() => {})` 形式的沉默错误吞没（允许有 `console.warn` 的降级处理）。
- SSE 流生成失败时用户可看到具体错误提示。
- 所有面向用户的错误消息通过 i18n 管理。

---

## 3. 其他已识别问题（可伴随相关整改项一并处理）

| 问题                                                                                                                                       | 位置                                     | 建议处理时机                           |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | -------------------------------------- |
| 跨模块深层 import：`auth/repositories/user-token-state.repository.ts` 直接 import `@modules/user/repositories/user.repository` 绕过 barrel | `user-token-state.repository.ts:1`       | 伴随 2.3 CI 边界检查                   |
| 邮件发送 bare await：`email.service.ts` 中 `transporter.sendMail()` 无 try-catch、无错误分类                                               | `email.service.ts:42`                    | 伴随 2.1 Worker 改造（邮件可纳入队列） |
| ConversationList 无虚拟化：对话列表全量渲染，百级数据量时有性能隐患                                                                        | `ConversationList.tsx:110`               | 伴随 2.6 前端组件拆分                  |
| R2 存储配置无条件验证：`STORAGE_TYPE=r2` 时未强制要求 5 个 R2 环境变量                                                                     | `env.ts` storageSchema                   | 伴随 2.5 配置化治理                    |
| document-ai 三个大 Service 的 SSE 流模式重复                                                                                               | `summary/analysis/generation.service.ts` | 伴随 2.6 大文件拆分                    |

---

## 4. 推荐实施顺序

```
Phase 1 — 止血与基础加固（低风险、立即收益）
├── 2.3  CI 依赖边界门禁
├── 2.4  Controller 验证层加固 + Schema 集中化
└── 2.5  硬编码常量配置化

Phase 2 — 核心改造（收益最大、涉及面广）
├── 2.1  Document Processing 独立 Worker
├── 2.2  LLM/Embedding 密钥隔离
└── 2.7  Agent 模块补测（P0）

Phase 3 — 质量提升（重构性质、持续推进）
├── 2.6  大函数/大文件拆分
├── 2.8  前端错误状态补全
├── 2.7  客户端测试补充（P1/P2）
└──  §3  伴随问题清理
```

Phase 1 各项之间无依赖，可并行推进。Phase 2 中 Worker 改造与密钥隔离可同步。Phase 3 为持续改进项，可按迭代节奏逐步完成。

---

## 5. 风险提示

- Worker 改造前，需要先定义任务幂等键与去重策略，否则重试可能放大副作用。
- 密钥隔离改造涉及历史配置兼容，建议先加读路径兼容与日志告警，再移除 fallback。
- 边界检查初期可能暴露较多存量问题，建议采用"先阻断新增、再清存量"的渐进策略。
- Controller 验证层改造需同步更新现有测试中 mock request body 的方式，避免测试误报。
- 大文件拆分属于纯重构，建议每个文件拆分作为独立 PR，降低冲突概率。
- Agent 模块补测优先级高于其他测试项——该模块承载工具编排、多轮迭代等核心逻辑，零测试意味着任何变更都在裸奔。
