# Knowledge Agent - 项目优化报告（核验版）

> 核验日期：2026-03-12
> 核验范围：当前仓库 HEAD 代码、`packages/shared` 契约、`packages/server` 路由与 schema、`packages/*/tests`、已提交 Drizzle migration、开发库实际落地状态
> 说明：本版以客观证据为主，修正原报告中已经过时的结论；数据库相关项以“schema + migration + 实库校验”三层证据为准

---

## 目录

1. [执行摘要](#1-执行摘要)
2. [项目概况（已核验）](#2-项目概况已核验)
3. [核验结果总览](#3-核验结果总览)
4. [仍然成立的关键问题](#4-仍然成立的关键问题)
5. [已过时或已完成的项](#5-已过时或已完成的项)
6. [部分成立且需要继续落地的项](#6-部分成立且需要继续落地的项)
7. [修订后的优先级与行动清单](#7-修订后的优先级与行动清单)

---

## 1. 执行摘要

- 项目整体仍处于生产可用区间，核心能力完整，且比原报告判断更成熟。
- 原报告中以下结论已经过时：
  - `GET /api/knowledge-bases` 无分页
  - `GET /api/chat/conversations` 无分页
  - `rag/search`、`chat/messages`、`document-ai/*`、KB 上传入口未限流
  - 无 coverage 配置
  - 无端到端测试
- 本轮数据库执行后，以下事项已完成：
  1. 新 migration 已执行，文档相关 FK 和 `documents.processing_started_at` 已落库。
  2. `db:check` 已通过，当前开发库一致性检查结果为 `12/12 checks passed`。
  3. 已补 `drizzle/meta/0005_snapshot.json` 与 `0006_snapshot.json`，修复手工 migration 后的 snapshot 基线缺口。
  4. 已新增 `db:drift-check` / `db:verify`，并在 `pre-push` 接入 schema/migration guard。
  5. `GET /api/chat/conversations` 已返回 `items + pagination`。
  6. `POST /api/knowledge-bases/:id/documents` 已补 `generalRateLimiter`。
  7. `rag.controller.ts` 已修正错误语义。
- 本轮处理可靠性增强后，以下事项也已完成：
  1. 超时 `processing` 文档会按 scheduler 定时重置为 `pending`，并可按开关立即重新入队。
  2. `db:check` 第 7 项已改为基于超时阈值统计 stale processing backlog。
- 本轮前端测试推进后，以下事项也已完成：
  1. 已补认证守卫与 token 刷新逻辑测试。
  2. 已补知识库列表/上传与聊天会话列表分页契约测试。
  3. 已补 `KnowledgeBaseDialog` 与 `ConversationList` 组件级交互测试。
- 本轮可维护性拆分后，以下事项也已完成：
  1. `shared/config/env.ts` 已拆为薄门面 + `env/loader.ts`、`schema.ts`、`validated-env.ts`、`configs.ts`。
  2. `chat.service.ts` 已拆为主编排 + `chat-agent-stream.service.ts`、`chat-legacy-stream.service.ts`、`chat.helpers.ts`、`chat.types.ts`。
  3. `agent-executor.ts` 已拆为主循环 + `agent-executor.citations.ts`、`agent-executor.runtime.ts`、`agent-executor.types.ts`。
  4. `processing.service.ts` 已拆为 facade + `processing.executor.ts`、`processing.lock.ts`、`processing.structure.ts`、`processing.stages.ts`、`processing.types.ts`。
  5. `document.repository.ts` 已拆为薄门面 + `document.repository.core.ts`、`document.repository.processing.ts`、`document.repository.queries.ts`、`document.repository.backfill.ts`、`document.repository.types.ts`。
  6. `scripts/db-consistency-check.ts` 已拆为 CLI entry + `db-consistency-check/checks.ts`、`report.ts`、`runner.ts`、`types.ts`。
  7. 已补充评估 `processing.executor.ts` / `processing.stages.ts`，当前不建议继续物理拆分，仅移除未使用的 `cleanupOldVectors` helper 作为最小清理。
  8. `StructuredRagOverview.tsx` 已拆为主容器 + `structured-rag/*` 子组件，主文件降至 `110` 行。
  9. 上述拆分与清理完成后，`@knowledge-agent/server build`、`agent-executor` 定向测试、`processing` 定向测试、`document-index/processing/search/counter-sync` 定向测试、`db-consistency-check` runner 定向测试与 `@knowledge-agent/client build` 均已通过。
- 本轮文档处理架构升级后，以下事项也已完成：
  1. `document_chunks` 与 vector payload 已绑定 `indexVersionId`，chunk/vector/graph 全部切换到 immutable build 产物模型。
  2. 查询链路已统一改为只消费 `documents.activeIndexVersionId` 指向的 active build。
  3. `processing` 成功路径不再删除旧 build 产物，发布语义已切换为 atomic publish。
  4. 已新增 superseded/failed immutable build 的后台 GC，并接入 scheduler。
  5. 已新增集成测试验证“发布后旧 build 被 GC，但 active build 不受影响”。
- 本轮 publish fencing 落地后，以下事项也已完成：
  1. `documents.publish_generation` 已落库，并在处理开始与 stale recovery 时递增。
  2. build publish 已改为带 compare-and-set 约束的 fenced publish。
  3. 慢 worker 即使跑到最后，也不能再激活旧 build 或覆盖新的 `processing` 完成态。
  4. `db:migrate`、`db:check`、processing/activation/integration 定向测试均已通过。
- 当前最需要优先处理的，已经切换为以下 4 项：
  1. 继续扩展到更多高风险页面/组件测试。
  2. 继续补齐前端 i18n 的剩余散落漏项。
  3. 继续补更多“文档版本切换 / backfill / recovery”链路的高阶集成测试。
  4. 若聊天会话量继续增长，优先复核 `conversations` 列表查询所需的 `updated_at` 复合索引，而不是 `created_at` / `messages.role`。

---

## 2. 项目概况（已核验）

| 指标          | 当前数据                                                        |
| ------------- | --------------------------------------------------------------- |
| 总文件数      | 645                                                             |
| TS/TSX 代码量 | ~51,000+ 行                                                     |
| 测试文件      | 119（server 102 / client 15 / shared 2）                        |
| 后端模块      | 15                                                              |
| 前端组件      | 81                                                              |
| 路由声明      | 77                                                              |
| 数据库表      | 22                                                              |
| 支持 LLM      | 6 种（OpenAI / Anthropic / Zhipu / DeepSeek / Ollama / Custom） |
| 支持嵌入      | 3 种（OpenAI / Zhipu / Ollama）                                 |
| VLM Provider  | 2 种（OpenAI / Anthropic）                                      |

> 补充：本轮回写聚焦结构拆分与状态修订，上表数量级指标未随本轮改动重新全量重算。

### 技术栈

| 层级 | 技术                                                                        |
| ---- | --------------------------------------------------------------------------- |
| 前端 | React 19、TypeScript、Vite、Tailwind CSS v4、TanStack Router/Query、Zustand |
| 后端 | Express 5、TypeScript、Drizzle ORM、MySQL、Redis、BullMQ、Qdrant            |
| 共享 | Zod、共享类型/常量/Schema                                                   |
| 工具 | pnpm workspace、Vitest、ESLint v9、Prettier、Husky                          |

### 与原报告相比的数量级变化

- 原报告中的 `~550 文件 / ~40,000 行 / 23 张表 / ~80 API` 只适合作为历史近似值，不应继续作为当前基线。
- 当前更可信的基线是：`645 文件 / ~51,000+ TS/TSX 行 / 22 张表 / 77 路由声明`。

---

## 3. 核验结果总览

| 编号 | 原报告结论                                     | 当前状态                                                                                                      | 结论   |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------ |
| K-1  | 大型后端/前端文件过多                          | 后端 4 个最突出的 600+ 行核心文件与 `document.repository.ts` 已完成拆分，但仍存在少量 400+ 行文件与前端大组件 | 成立   |
| K-2  | Zustand `getState()` 绕过响应式系统            | 组件/路由层已完成收敛，store 内部保留少量非 React 快照访问                                                    | 已过时 |
| K-3  | `throw new Error()` 未统一到 `Errors/AppError` | `server/client` 运行时代码已清零，CLI 脚本层仍保留少量原生 Error                                              | 已过时 |
| K-4  | 前端 i18n 覆盖不完整                           | 仍存在                                                                                                        | 成立   |
| K-5  | 路由级错误边界不足                             | 根路由外，聊天/文档详情/知识库详情/AI 设置已具备功能域级 `errorComponent`                                     | 已过时 |
| K-6  | `GET /api/knowledge-bases` 无分页              | 已支持分页参数与分页返回                                                                                      | 已过时 |
| K-7  | `GET /api/chat/conversations` 无分页           | 已支持 `limit/offset` 且返回 `items + pagination`                                                             | 已过时 |
| K-8  | 高开销 API 未限流                              | RAG / Chat / Document AI / Documents / KB 上传均已限流                                                        | 已过时 |
| K-9  | 文档相关表缺数据库级 FK                        | migration 已执行，相关 FK 已落库                                                                              | 已过时 |
| K-10 | `processing_started_at` 缺失                   | 字段已落库，超时恢复任务也已接入 scheduler                                                                    | 已过时 |
| K-11 | 无 coverage 配置                               | 已有 `vitest --coverage` 与 V8 coverage                                                                       | 已过时 |
| K-12 | 无端到端测试                                   | 已有 server smoke e2e 和 integration tests                                                                    | 已过时 |
| K-13 | `vlm` 完全无测试                               | factory / service / provider 测试已补齐                                                                       | 已过时 |

---

## 4. 仍然成立的关键问题

### 4.1 可维护性问题仍然明显

#### 后端超大文件

- 原报告点名的 `rag/services/processing.service.ts`、`chat/services/chat.service.ts`、`agent/agent-executor.ts`、`shared/config/env.ts` 已完成第一轮拆分，不应继续作为“当前最突出的 600+ 行后端核心文件”示例。
- 本轮前述 `document/repositories/document.repository.ts` 也已拆为薄门面 + `core / processing / queries / backfill / types` 子模块，不应继续列为未处理的 400+ 行 repository。
- 原本剩余的 `scripts/db-consistency-check.ts` 也已进一步拆为 CLI entry + `checks / report / runner / types` 子模块，不应继续作为剩余 400+ 行后端脚本案例。
- 已补充评估 `processing.executor.ts` / `processing.stages.ts`，当前判断是不再继续物理拆分，以避免为了拆分而拆分；仅保留最小清理。
- 当前后端可维护性压力更多集中在少量仍偏大的前端页面/组件与高风险链路测试覆盖，而不再是单个超大后端脚本。

#### 前端超大文件

| 文件                                                | 行数 | 状态   |
| --------------------------------------------------- | ---- | ------ |
| `pages/knowledge-bases/KnowledgeBaseDetailPage.tsx` | 505  | 仍成立 |
| `components/settings/ai/AISettingsForm.tsx`         | 482  | 仍成立 |
| `pages/ChatPage.tsx`                                | 452  | 仍成立 |
| `components/auth/ForgotPasswordForm.tsx`            | 451  | 仍成立 |

补充：

- `components/dashboard/StructuredRagOverview.tsx` 已拆分完成，当前主文件为 `110` 行，不应继续列为超大组件。
- `pages/documents/DocumentDetailPage.tsx` 当前为 `379` 行，已不再属于首批 `400+` 行治理名单。
- 原报告中部分前端文件路径已变化，但“仍有少量前端大组件需要继续治理”的结论没有变化。

### 4.2 前端国际化仍未补齐

本轮已完成第一批 i18n 收口，但仍需继续扫描其余散落硬编码。

已完成收口的项包括：

- `ProcessingStatusBadge.tsx`：`Pending / Processing / Completed / Failed`
- `DocumentList.tsx`：`Grid view / List view`
- `SessionCard.tsx`：`Unknown device`
- `useLLMConfig.ts`：`AI settings saved successfully` 等 toast 文案
- `lib/utils.ts`：`Bytes / KB / MB / GB / TB`
- `lib/http/stream-client.ts`：`No response body`

当前剩余工作：

- 继续排查其他页面级组件中的零散 `aria-label` / fallback 文案
- 继续排查 client 工具层与 HTTP 层未进入本轮名单的散落错误文案

### 4.3 本轮点名的运行时级具体缺陷已收敛

- `summary.service.ts` 的批处理容错已完成，单项失败不再放大为整批失败。
- `shared/config/env/validated-env.ts` 已改为抛出带环境元数据与 field errors 的结构化校验错误。

---

## 5. 已过时或已完成的项

### 5.1 知识库列表分页已完成

原报告中“`GET /api/knowledge-bases` 无分页”已经过时。

当前已具备：

- `knowledgeBaseListParamsSchema`：支持 `page`、`pageSize`
- `knowledgeBaseService.list()`：返回 `pagination`
- 路由层已校验分页参数

### 5.2 多数高开销 AI 端点已限流

原报告中关于以下端点“未保护”的说法已经过时：

- `POST /api/rag/search`
- `POST /api/rag/process/:documentId`
- `POST /api/chat/conversations/:id/messages`
- `POST /api/document-ai/*`

这些端点当前都已挂载 `aiRateLimiter`。

同时：

- `POST /api/documents`
- `POST /api/documents/:id/versions`
- `POST /api/knowledge-bases/:id/documents`

也已使用 `generalRateLimiter`。

### 5.3 Coverage 配置已存在

原报告中“无覆盖率报告配置（vitest coverage）”已经过时。

当前已具备：

- 根目录 `test:coverage`
- server 包 `test:coverage`
- 根 `vitest.config.ts` 中的 V8 coverage 配置

### 5.4 已存在 e2e / integration 测试

原报告中“无端到端浏览器测试”如果特指 Playwright/Cypress，可以成立；但如果泛指 e2e，则已经过时。

当前已有：

- `packages/server/tests/e2e/smoke-auth.e2e.test.ts`
- `packages/server/tests/e2e/smoke-chat.e2e.test.ts`
- `packages/server/tests/e2e/smoke-kb-document.e2e.test.ts`
- `packages/server/tests/e2e/smoke-trash.e2e.test.ts`
- 以及若干 integration tests

### 5.5 数据库索引缺口并非原报告所述那么大

原报告点名的以下索引，当前在 schema 和已提交 SQL 中已经存在：

- `document_chunks.document_id`
- `document_node_contents(document_id, index_version_id)`
- `document_edges(document_id, index_version_id)`
- `messages(conversation_id, created_at)`

因此不应继续把它们列为“待补充索引”。

### 5.6 数据库 migration 已执行并通过校验

本次已完成数据库侧落地验证：

- 已执行 `pnpm -F @knowledge-agent/server db:migrate`
- 最新 migration：`packages/server/drizzle/0006_mellow_captain_britain.sql`
- 已确认 `documents.processing_started_at` 在库中存在
- 已确认本次 migration 引入的 16 个 FK 在库中存在
- 已确认 `document_chunks.index_version_id` 已落库
- 已确认 `documents.publish_generation` 已落库
- 已执行 `pnpm -F @knowledge-agent/server db:check`
- 当前结果：`12/12 checks passed`
- 已补 `packages/server/drizzle/meta/0005_snapshot.json` 与 `0006_snapshot.json`
- 已新增 `pnpm -F @knowledge-agent/server db:drift-check`
- 已新增 `pnpm -F @knowledge-agent/server db:verify`
- `.husky/pre-push` 已接入 `db:drift-check`

补充：

- `db:check` 在执行过程中暴露出一个历史问题：脚本里使用了 MySQL 保留字别名 `stored`
- 该问题已修复，现有校验脚本可正常作为数据库一致性验证手段
- 本轮新增 migration 首次执行时还暴露出一个 MySQL 保留字别名问题（`div`）
- 该问题已修复，当前 migration 已支持在“部分迁移已落库”的场景下安全重跑
- `db:drift-check` 当前会同时校验：
  - journal entry 是否缺 snapshot
  - drizzle snapshot 结构是否合法
  - 基于临时 out 目录重新 generate 时是否还会生成未提交 migration
- 当前本地已验证 `db:verify` 可跑通，包含 `db:drift-check + db:check`

### 5.7 文档处理超时恢复任务已完成

本次已完成超时恢复能力：

- `documentConfig` 已新增恢复相关配置：
  - `DOCUMENT_PROCESSING_TIMEOUT_MINUTES`
  - `DOCUMENT_PROCESSING_RECOVERY_ENABLED`
  - `DOCUMENT_PROCESSING_RECOVERY_REQUEUE_ENABLED`
  - `DOCUMENT_PROCESSING_RECOVERY_CRON`
  - `DOCUMENT_PROCESSING_RECOVERY_BATCH_SIZE`
- `processingStartedAt` 现在会在进入 `processing` 时写入，并在切回非 `processing` 状态时清空
- scheduler 已接入 stale processing recovery 任务
- stale recovery 在成功重置后可按开关自动重新入队，并使用 recovery generation 后缀避免与旧 jobId 冲突
- `db:check` 第 7 项已改为基于超时阈值统计 stale processing，而非把所有 `processing` 文档都视为问题

当前已验证：

- 相关 scheduler / service 测试通过
- `document-processing.queue` 定向测试通过
- `@knowledge-agent/server build` 通过
- `db:check` 仍为 `12/12 checks passed`

### 5.8 错误处理统一（运行时）已完成

本次已完成错误处理统一的核心治理：

- `packages/server/src` 运行时代码中的裸 `throw new Error()` 已清零
- `packages/client/src` 运行时代码中的裸 `throw new Error()` 已清零
- server 运行时错误已统一收敛到 `Errors.*` / `AppError`
- client 侧保留的编程防卫已改为更准确的 `TypeError`

覆盖范围包括：

- `llm.factory`
- `model-fetcher.service`
- `embedding.factory`
- `vlm.factory`
- `r2.provider`
- `rag/processing.service`
- `document-ai-llm.service`
- `redis.client`
- `rate-limit.middleware`
- `qdrant.client`
- 多个 `llm/embedding` provider

补充说明：

- CLI 脚本层仍保留少量原生 `Error` / `console.*`
- 这部分属于脚本语义，不再作为当前主线治理问题
- 相关 provider / factory / error-injection 测试已通过

### 5.9 前端 `getState()` 直读治理已完成

本次已完成前端 `getState()` 收敛：

- `ChatPage.tsx` 已移除组件内对 `useChatPanelStore.getState()` / `useAuthStore.getState()` 的直接访问
- `ChatPanel.tsx` 已移除组件内对 `useAuthStore.getState()` 的直接访问
- `auth.guard.ts` 已改为通过 store 导出的快照 helper 访问认证状态
- `authStore.ts` 已将非 React 场景的状态读取集中封装为快照 helper

当前状态：

- `packages/client/src` 中的 `.getState()` 已全部收敛到 `authStore.ts` 内部
- 组件层和路由层不再直接调用 `.getState()`
- 剩余访问属于非 React 场景的集中封装，不再视为“页面层状态读取不规范”

验证：

- `pnpm -F @knowledge-agent/client build` 通过

### 5.10 功能域级错误边界已完成

本次已完成高风险前端路由的功能域级错误边界：

- 聊天页：`chat.route.tsx`
- 文档详情：`documents.$id.route.tsx`
- 知识库详情：`knowledge-bases.$id.route.tsx`
- AI 设置：`settings.ai.route.tsx`

实现方式：

- 扩展了 `RouteError`，支持按功能区传不同的标题和默认文案 key
- 为高风险路由添加独立 `errorComponent`
- 已补充中英文错误文案

验证：

- `pnpm -F @knowledge-agent/client build` 通过

### 5.11 VLM 测试已完成

本次已为 `vlm` 模块补齐基础测试覆盖：

- `vlm.factory.test.ts`
- `vlm.service.test.ts`
- `openai-vlm.provider.test.ts`
- `anthropic-vlm.provider.test.ts`

覆盖点包括：

- provider 初始化与缓存/重置
- API key 回退逻辑
- `describeImage` 参数拼装
- 超时、重试、非重试错误
- `describeImageBatch` 的部分失败返回
- OpenAI / Anthropic health check

验证：

- 定向 `vlm` 测试 `16` 个全部通过
- `@knowledge-agent/server build` 通过

### 5.12 高风险前端流程测试已有阶段性进展

本次新增了 6 组前端测试，其中包含逻辑流测试与组件级交互测试：

- `tests/lib/http/auth.test.ts`
- `tests/routes/auth.guard.test.ts`
- `tests/api/knowledge-bases.test.ts`
- `tests/api/chat.conversations.test.ts`
- `tests/components/knowledge-bases/KnowledgeBaseDialog.test.tsx`
- `tests/components/chat/ConversationList.test.tsx`

覆盖点包括：

- token 刷新并发复用、失效清理、无会话场景
- `requireAuth` / `requireGuest` 路由守卫
- 知识库列表分页响应兼容、知识库文档列表、上传参数透传
- 聊天会话列表分页响应、legacy `chatApi.listConversations` 兼容
- `KnowledgeBaseDialog` 创建/编辑交互
- `ConversationList` 分组渲染、选择会话、删除当前会话后的回调与失效

同时修复了一个真实前端契约问题：

- `knowledgeBasesApi.list()` 已改为兼容后端分页响应，并返回 `knowledgeBases`

验证：

- 新增 client 定向测试 `18` 个全部通过
- `@knowledge-agent/client build` 通过

### 5.13 后端核心大文件与 `db-consistency-check` 已完成结构拆分

本次已完成以下结构治理：

- `shared/config/env.ts` 已收口为薄门面，环境加载 / schema / 校验 / 配置映射分别拆到 `env/*` 子模块。
- `chat.service.ts` 已拆分为主编排、agent streaming、legacy streaming、helper、type 五部分。
- `agent-executor.ts` 已拆分为主循环、citation 选择、运行时辅助、类型定义四部分。
- `processing.service.ts` 已拆分为 facade、主执行器、锁管理、结构解析、阶段处理、类型定义六部分。
- `document.repository.ts` 已进一步拆分为薄门面、CRUD/listing、processing、query helper、backfill、types 六部分。
- `scripts/db-consistency-check.ts` 已拆为 CLI 入口与 `checks.ts`、`report.ts`、`runner.ts`、`types.ts` 四个职责子模块。
- 已补充评估 `processing.executor.ts` / `processing.stages.ts` 的继续细化必要性，当前结论是不再新增文件层级，只移除未使用的 `cleanupOldVectors` helper。

修订结论：

- 原报告中“4 个 600+ 行后端核心文件仍然全部未拆”的说法已经过时。
- “大文件问题”并未完全消失，但最突出的后端热点已经完成一轮可维护性收敛。
- `document.repository.ts` 也不应继续作为“剩余 400+ 行后端文件”的代表案例。
- 当前不建议继续拆分 `processing.executor.ts` / `processing.stages.ts`，因为它们仍保持“单一编排入口 + 阶段 helper 聚合”的清晰边界，继续拆分的收益低于复杂度成本。
- 当前更合理的下一步是把治理重心转向前端大组件与高风险链路测试，而不是继续细碎化 processing 子模块。

验证：

- `pnpm -F @knowledge-agent/server build` 通过
- 已删除未使用的 `cleanupOldVectors` helper，作为 processing 子模块的最小清理
- `pnpm test -- packages/server/tests/scripts/db-consistency-check.runner.test.ts`：`4` 个测试全部通过
- `pnpm test -- packages/server/tests/modules/agent/agent-executor.test.ts`：`32` 个测试全部通过
- `pnpm test -- packages/server/tests/modules/rag/processing.error-injection.test.ts packages/server/tests/modules/rag/processing-recovery.service.test.ts`：`17` 个测试全部通过
- `pnpm test -- packages/server/tests/modules/document-index/document-index-backfill.service.test.ts packages/server/tests/modules/document-index/document-index-activation.service.test.ts packages/server/tests/modules/rag/processing-recovery.service.test.ts packages/server/tests/modules/rag/search.service.test.ts packages/server/tests/modules/knowledge-base/services/counter-sync.service.test.ts`：`21` 个测试全部通过

### 5.14 文档处理已切换为 immutable build + atomic publish

本次已完成以下结构升级：

- `document_index_versions.id` 现在作为统一 build 标识。
- `document_chunks` 已新增 `indexVersionId`，同一 `documentVersion` 允许多个 build 并存。
- vector payload 已新增 `indexVersionId`，查询结果会在搜索侧按 active build 过滤。
- graph 原本就按 `indexVersionId` 存储，现在 chunk / vector / graph 的 build 作用域已统一。
- `documents.activeIndexVersionId` 现作为统一 publish pointer，搜索链路只消费 active build。
- `processing` 成功路径不再删除旧 build 的 chunk/vector，而是保留为历史产物。

修订结论：

- 原先“同一文档重建时原地替换 chunk/vector”的语义已经过时。
- 当前文档索引链路已经具备 immutable build + atomic publish 的基础模型。
- 这显著降低了“构建中间态污染线上查询结果”的风险。

验证：

- `pnpm -F @knowledge-agent/server build` 通过
- `pnpm -F @knowledge-agent/server db:migrate` 通过
- `pnpm -F @knowledge-agent/server db:check` 通过，结果为 `12/12 checks passed`
- 已新增 `tests/modules/rag/search.service.test.ts`，验证只返回 active build 的向量候选

### 5.15 superseded/failed immutable build 的后台 GC 已接入

本次已完成以下清理能力：

- 已新增 `document-index-artifact-cleanup.service.ts`
- scheduler 已新增 immutable build cleanup 定时任务
- cleanup 会在保留期后清理 `superseded/failed` build 的：
  - `document_index_versions`
  - 关联 `document_chunks`
  - 关联 graph 产物（通过 FK cascade）
  - 对应 `indexVersionId` 的 vector
- 新增配置项：
  - `DOCUMENT_BUILD_CLEANUP_ENABLED`
  - `DOCUMENT_BUILD_CLEANUP_CRON`
  - `DOCUMENT_BUILD_CLEANUP_RETENTION_DAYS`
  - `DOCUMENT_BUILD_CLEANUP_BATCH_SIZE`

验证：

- `pnpm test -- packages/server/tests/modules/document-index/document-index-artifact-cleanup.service.test.ts packages/server/tests/modules/vector/vector.error-injection.test.ts packages/server/tests/shared/scheduler/scheduler.test.ts`：`31` 个测试全部通过
- 已新增 `tests/integration/document-index/immutable-build-gc.integration.test.ts`，验证“发布后旧 build 被 GC，但 active build 不受影响”

### 5.16 publish fencing 已落地

本次已完成以下并发安全增强：

- `documents` 已新增 `publish_generation`
- `acquireProcessingLock()` 在把文档切到 `processing` 时会递增 `publish_generation`
- stale recovery 在把文档重置为 `pending` 时也会递增 `publish_generation`
- build publish 现在必须满足 `publish_generation` compare-and-set 条件
- `documentIndexActivationService.activateVersion()` 已切换到 fenced publish 模式
- `processing` 失败写回也已改为 generation-aware，避免旧 worker 晚到覆盖新状态

修订结论：

- 原报告里“publish fencing 仍待评估/落地”的说法已经过时。
- 当前文档处理链路已经从“immutable build + atomic publish”进一步推进到“immutable build + fenced publish + build GC”。
- 剩余风险主要不在核心发布正确性，而在更高层的复杂链路覆盖是否充分。

验证：

- `pnpm -F @knowledge-agent/server build` 通过
- `pnpm -F @knowledge-agent/server db:migrate` 通过
- `pnpm -F @knowledge-agent/server db:check` 通过，结果为 `12/12 checks passed`
- `pnpm test -- packages/server/tests/modules/document-index/document-index-activation.service.test.ts packages/server/tests/modules/rag/processing.error-injection.test.ts packages/server/tests/modules/rag/processing-recovery.service.test.ts packages/server/tests/modules/rag/search.service.test.ts packages/server/tests/integration/document-index/immutable-build-gc.integration.test.ts`：`26` 个测试全部通过
- 已在 `tests/integration/document-index/immutable-build-gc.integration.test.ts` 新增“stale recovery 递增 generation 后，旧 worker publish 被 fencing 拦截”的组合场景验证
- 已在 `tests/integration/document-index/immutable-build-gc.integration.test.ts` 新增“backfill 先排到旧版本，随后发生 version switch + recovery，旧 backfill build publish 被 fencing 拦截”的组合场景验证
- 已在 `tests/integration/document-index/immutable-build-gc.integration.test.ts` 新增“连续多次 version switch + repeated recovery + delayed GC 后，仅最新 active build 保留”的组合场景验证
- 已在 `tests/integration/document-index/immutable-build-gc.integration.test.ts` 新增“backfill 目标落后、连续多次 version switch、repeated recovery、delayed GC 串联后，仅最新 active build 保留”的组合场景验证
- 已新增 `tests/integration/document-index/document-index-backfill.worker-combo.integration.test.ts`，用于真实 DB/queue worker 参与的端到端组合验证

### 5.17 摘要批处理容错已完成

本次已完成以下可靠性增强：

- `summary.service.ts` 的分批摘要已从 `Promise.all()` 改为 `Promise.allSettled()`
- 单个 chunk 摘要失败不再导致整批 long-document summarization 失败
- 成功 chunk 会继续参与最终 merge，只有“全部 chunk 都失败”时才整体抛错

验证：

- `pnpm test -- packages/server/tests/modules/document-ai/services/summary.service.test.ts`：`12` 个测试全部通过

### 5.18 环境变量校验失败输出已统一

本次已完成以下治理：

- `validated-env.ts` 在 schema 校验失败时不再直接 `console.error + process.exit(1)`
- 现改为抛出 `Errors.validation(...)`，并附带 `environment`、`configDir`、`fieldErrors`
- 已新增模块级测试，覆盖“校验成功导出 env”与“校验失败抛结构化错误”两条路径

验证：

- `pnpm test -- packages/server/tests/shared/config/validated-env.test.ts`：`2` 个测试全部通过
- `pnpm -F @knowledge-agent/server build` 通过

### 5.19 文档上传/预览测试已补第一批

本次新增了 2 组前端组件测试：

- `tests/components/documents/DocumentUpload.test.tsx`
- `tests/components/documents/DocumentReader.test.tsx`

覆盖点包括：

- `DocumentUpload` 成功批次完成后的 query invalidation、延迟清理与 `onSuccess` 回调
- `DocumentUpload` 失败批次保留错误项，不提前清空上传队列
- `DocumentUpload` drop rejection 的 toast 错误提示
- `DocumentReader` 的 markdown 预览渲染与危险 HTML 转义
- `DocumentReader` 的 PDF 预览回退下载提示

验证：

- `pnpm test -- packages/client/tests/components/documents/DocumentUpload.test.tsx packages/client/tests/components/documents/DocumentReader.test.tsx`：`5` 个测试全部通过
- `pnpm -F @knowledge-agent/client build` 通过

### 5.20 前端 i18n 第一批已完成

本次已完成以下 i18n 收口：

- `ProcessingStatusBadge.tsx` 已接入 `document.status.*`
- `DocumentList.tsx` 与 `KnowledgeBasesPage.tsx` 的视图按钮 `aria-label` 已接入 i18n
- `SessionCard.tsx` 的设备信息、当前会话标签、时间字段与撤销按钮已接入 `session.card.*`
- `useLLMConfig.ts` 的保存/清空 toast 已接入 `settings.toast.*`
- `lib/utils.ts` 的文件大小单位已接入 `common.fileSize.units.*`
- `lib/http/stream-client.ts` 与 `lib/http/auth.ts` 的默认错误文案已接入 `common.stream.*` / `common.auth.*`
- `DocumentViewer.tsx` 已改为消费已有 `document.viewer.*` 文案

验证：

- `pnpm -F @knowledge-agent/client build` 通过

### 5.21 会话/消息索引缺口已完成确认

本次已完成以下核验：

- 代码侧已确认 `conversationRepository.listByUser()` 实际按 `updatedAt` 排序，而不是 `createdAt`
- 开发库 `EXPLAIN` 显示会话列表查询当前命中的是现有过滤索引，并伴随 `Using filesort`；补 `conversations.created_at` 不能改善该查询
- 消息侧查询当前主要依赖 `conversation_id_idx` / `conversation_created_idx`
- 开发库消息角色分布当前为 `user=10`、`assistant=4`，`role` 基数很低，单列 `messages.role` 索引收益有限

修订结论：

- 当前不建议为 `conversations.created_at` 新增索引
- 当前也不建议为 `messages.role` 新增单列索引
- 若后续聊天会话量继续增长，更值得优先评估的是贴合列表查询排序的 `updated_at` 复合索引，而不是原报告点名的这两项

### 5.22 文档版本切换/backfill/recovery 高阶测试已继续扩展

本次新增了一个更强的真实 worker 组合场景：

- `tests/integration/document-index/document-index-backfill.worker-combo.integration.test.ts`

覆盖点包括：

- 同一文档连续两次发生 version switch + stale recovery
- 两个旧 backfill run 在真实 DB/queue worker 下都被标记为 `skipped`
- 第三个 rerun 只针对最新版本完成处理，最终文档状态保持在最新版本
- 已补“旧 backfill job + 旧 recovery job 都因 version switch 变 stale，最新 recovery rerun 完成”的真实 DB/queue worker 场景
- 上述 real worker combo 测试已改为“每例独立模块实例 + 独立 `REDIS_PREFIX`”隔离夹具，降低队列单例复用带来的时序抖动

验证：

- `pnpm test -- packages/server/tests/integration/document-index/document-index-backfill.worker-combo.integration.test.ts`：`2` 个测试全部通过

### 5.23 `StructuredRagOverview` 已完成组件级拆分

本次已完成以下前端结构治理：

- `StructuredRagOverview.tsx` 已收敛为主容器，负责数据获取、筛选状态和导出动作编排。
- 已新增 `components/dashboard/structured-rag/` 子目录，拆出：
  - `StructuredRagHeader.tsx`
  - `StructuredRagAlerts.tsx`
  - `StructuredRagStats.tsx`
  - `StructuredRagInsightsGrid.tsx`
  - `StructuredRagBreakdownTable.tsx`
  - `utils.ts`
- 主文件当前降至 `110` 行，局部展示逻辑按“头部 / 告警 / 指标 / 详情 / 表格”边界分离。
- 本次拆分未改动交互语义，仅降低页面级组件复杂度。

修订结论：

- `components/dashboard/StructuredRagOverview.tsx` 不应继续列为剩余 400+ 行前端大组件。
- 当前更值得继续处理的是 `KnowledgeBaseDetailPage.tsx`、`AISettingsForm.tsx`、`ChatPage.tsx` 与 `ForgotPasswordForm.tsx`。

验证：

- `pnpm -F @knowledge-agent/client build` 通过

---

## 6. 部分成立且需要继续落地的项

### 6.1 文档处理并发安全主链已完成，但仍需继续扩大复杂链路覆盖

当前状态：

- `documents.schema.ts` 已存在 `processingStartedAt`
- 新 migration 已将该字段落库
- scheduler 已接入“重置卡死 processing 文档”的定时任务
- `db:check` 已按超时阈值检查 stale processing backlog
- chunk / vector / graph 已切换到 immutable build 产物模型
- `documents.activeIndexVersionId` 已成为统一 publish pointer
- superseded / failed build 的后台 GC 已接入
- `documents.publish_generation` 已落库并接入 fenced publish

修订结论：

- 该项已经从“字段缺失”推进到“已具备 immutable build + fenced publish + build GC”
- 当前剩余风险不再是核心发布正确性，而是复杂链路下是否存在未覆盖到的边缘场景
- 当前已覆盖：
  - active build 搜索过滤
  - publish 后旧 build GC
  - stale recovery 后旧 build publish 被 fencing 拦截
  - backfill 目标落后于当前版本时，version switch + recovery 后旧 backfill build publish 被 fencing 拦截
  - 连续多次 version switch + repeated recovery + delayed GC 后，仅最新 active build 保留
- 当前也已覆盖：
  - 真实 DB/queue worker 参与的 `backfill + version switch + recovery` 端到端组合测试
  - 真实 DB/queue worker 参与的“连续两次 version switch + repeated recovery 后，两个旧 backfill run skipped，第三次 rerun 完成”组合测试
  - 真实 DB/queue worker 参与的“旧 backfill job + 旧 recovery job 均 stale，最新 recovery rerun 完成”组合测试
  - 真实 DB/queue 环境下的 backfill enqueue / resume 链路
- 下一步更合理的是继续增加更多 worker 级组合链路覆盖，而不是只停留在单个回归场景

### 6.2 原报告点名的剩余索引缺口已确认暂不补充

已确认结论：

- `conversations.created_at`：当前仓库内未看到对应热点查询，列表主链路实际按 `updatedAt` 排序，补 `created_at` 索引无直接收益
- `messages.role`：当前角色值基数低，且现有查询计划主要依赖 `conversation_id` / `created_at` 维度，单列 `role` 索引收益有限

后续建议：

- 若聊天会话列表数据规模显著增长，应优先评估与 `updatedAt` 排序对齐的复合索引
- 在没有新查询形态或性能证据前，不建议仅凭字段存在就补 `created_at` / `role` 索引

---

## 7. 修订后的优先级与行动清单

### Phase 1：立即处理（P0）

#### 7.1 已完成：同步 schema 与 migration

已完成结果：

- 已生成并执行新 migration
- 文档相关 FK 已落库
- `documents.processing_started_at` 已落库
- `db:check` 已通过，当前开发库 12/12 项一致性检查通过
- 已补 `drizzle/meta/0005_snapshot.json` 与 `0006_snapshot.json`
- 已新增 `db:drift-check` / `db:verify`
- 已在 `pre-push` 接入 `db:drift-check` 作为结构校验约束

当前剩余工作：

- 若后续补 CI workflow，可直接复用 `pnpm -F @knowledge-agent/server db:verify`

#### 7.2 已完成：为知识库上传入口补限流

已完成结果：

- `POST /api/knowledge-bases/:id/documents` 已增加 `generalRateLimiter`

#### 7.3 已完成：为会话列表返回分页元数据

已完成结果：

- `GET /api/chat/conversations` 现返回 `items + pagination`
- client API、hooks、相关测试均已同步

#### 7.4 已完成：修正 RAG controller 错误语义

已完成结果：

- 参数缺失已改为 `Errors.validation(...)`
- 资源缺失已改为 `Errors.notFound('Document')`

#### 7.5 已完成：补齐处理超时恢复任务

已完成结果：

- 基于 `processing_started_at` 检测 stale processing
- scheduler 已定时重置超时文档为 `pending`
- stale recovery 成功后可按 `DOCUMENT_PROCESSING_RECOVERY_REQUEUE_ENABLED` 自动重新入队
- `db:check` 已与超时语义保持一致

当前剩余工作：

- Phase 1 范围内的恢复主链与高阶组合链路测试已完成当前阶段目标
- 后续若继续扩大更多 worker 级 permutation，归入持续硬化项，而不再视为 Phase 1 blocker

---

### Phase 2：一致性治理（P1）

#### 7.6 已完成：统一运行时代码中的 `throw new Error()`

已完成结果：

- `server/client` 运行时代码中的裸 `throw new Error()` 已清零
- server 运行时已统一收敛到 `Errors.*` / `AppError`
- 相关 provider / factory / error-injection 测试通过

当前剩余工作：

- 如需进一步收敛，可再单独评估 CLI 脚本层是否也要统一到 `AppError`

#### 7.7 已完成第二轮：拆分后端四个超大核心文件与 `db-consistency-check`

已完成结果：

- `processing.service.ts`、`chat.service.ts`、`agent-executor.ts`、`env.ts` 已完成第一轮物理拆分
- `document.repository.ts` 已继续拆为 facade + `core` / `processing` / `queries` / `backfill` / `types`
- `db-consistency-check.ts` 已进一步拆为 CLI entry + `checks` / `report` / `runner` / `types`
- 已补充完成 `processing.executor.ts` / `processing.stages.ts` 的继续拆分评估，当前结论是不再物理拆分，仅移除未使用 helper
- 对外导出与主要调用方式保持兼容
- `@knowledge-agent/server build` 与相关定向测试均已通过

当前剩余工作：

- 前端超大页面/组件仍需后续治理

#### 7.8 已完成：调整批处理容错

已完成结果：

- 已将 `summary.service.ts` 中的分批摘要从 `Promise.all()` 调整为失败隔离策略
- 单个 chunk 失败不再放大为整批失败
- 已补“部分 chunk 失败继续 merge”与“全部 chunk 失败才抛错”的单元测试

#### 7.9 已完成：为 VLM 补测试

已完成结果：

- 已补 `factory / service / provider` 测试
- 超时、重试、批量部分失败、health check 已有覆盖
- 当前 `vlm` 不再属于“完全无测试”状态

#### 7.10 已完成：确认剩余数据库索引缺口

已完成结果：

- 已基于真实查询链路与开发库 `EXPLAIN` 完成确认
- 当前不建议新增 `conversations.created_at` 索引
- 当前不建议新增 `messages.role` 单列索引
- 若后续需要优化聊天会话列表，更值得优先评估的是 `updated_at` 相关复合索引

#### 7.11 已完成：为 publish 阶段增加 fenced publish 保护

已完成结果：

- `documents.publish_generation` 已接入 schema / migration / recovery / processing lock
- `activeIndexVersionId` 切换已带 compare-and-set 约束
- 慢 worker 晚到时会留下 unpublished build，但不会重新激活旧 build 或覆盖完成态

当前剩余工作：

- 扩大 backfill / recovery / 多版本切换的组合场景测试覆盖
- 评估是否还需要 heartbeat 或更细粒度的 worker lease 观测指标

---

### Phase 3：前端质量强化（P2）

#### 7.12 已完成：清理组件中的 `getState()` 直读

已完成结果：

- `ChatPage.tsx`、`ChatPanel.tsx`、`auth.guard.ts` 已完成收敛
- 组件层和路由层不再直接访问 `.getState()`
- 剩余 `.getState()` 已集中封装在 `authStore.ts` 的非 React 快照 helper 中

#### 7.13 已完成第一批：补齐 i18n 漏项

已完成结果：

- 处理状态标签
- 视图按钮 `aria-label`
- session/device 文案
- LLM 设置 toast
- 文件大小单位
- SSE/stream 错误文案

当前剩余工作：

- 继续扫描其他页面级组件中的散落硬编码
- 继续扫描 client 工具层/HTTP 层未纳入首批名单的 fallback 文案

#### 7.14 已完成：增加功能域级错误边界

已完成结果：

- 聊天页、文档详情、知识库详情、AI 设置已接入独立 `errorComponent`
- `RouteError` 已支持按功能区渲染不同标题与默认文案
- 中英文错误文案已补齐

#### 7.15 持续推进：补前端关键路径测试

本轮已完成：

- 认证守卫与 token 刷新逻辑测试
- 知识库列表/上传 API 契约测试
- 聊天会话列表分页与 legacy 兼容测试
- `KnowledgeBaseDialog` 组件级交互测试
- `ConversationList` 组件级交互测试
- `DocumentUpload` 组件测试
- `DocumentReader` 组件测试

下一步优先顺序：

1. 知识库管理
2. 聊天消息发送
3. LLM 配置页
4. 文档详情页面级交互

---

## 附录：本次核验后不建议继续沿用的旧结论

- 不建议继续写“知识库列表无分页”，因为这会误导优先级。
- 不建议继续写“RAG/Chat/Document AI 未限流”，因为主体工作已经完成。
- 不建议继续写“无 coverage / 无 e2e”，因为仓库里已经有实际配置和用例。
- 不建议继续写“数据库完全缺 FK”，因为当前开发库中相关 FK 已经落地。
- 不建议继续写“`processing_started_at` 缺失”，更准确的说法是：
  - 字段已落库
  - 基础恢复任务已实现
  - publish 阶段的 fenced publish 也已落地
- 不建议继续写“运行时代码里仍广泛存在 `throw new Error()`”，更准确的说法是：
  - `server/client` 运行时代码已统一完成
  - 剩余少量原生 Error 主要在 CLI 脚本层
- 不建议继续写“前端组件和路由层仍广泛直接使用 `getState()`”，更准确的说法是：
  - 组件层和路由层已完成收敛
  - 剩余 `.getState()` 已集中封装在 store 内部的非 React 快照 helper 中
- 不建议继续写“`vlm` 完全无测试”，因为当前已补齐 `factory / service / provider` 基础测试覆盖
- 不建议继续写“`processing.service.ts`、`chat.service.ts`、`agent-executor.ts`、`env.ts` 仍是当前最突出的 600+ 行后端核心文件”，更准确的说法是：
  - 这 4 个文件已完成第一轮拆分
  - 主流程已下沉到更细的子模块
  - 剩余可维护性压力主要转移到少数 400+ 行文件与前端大组件
- 不建议继续写“文档处理仍采用原地替换 chunk/vector 的发布模型”，更准确的说法是：
  - chunk / vector / graph 已切换到 immutable build 产物模型
  - 查询链路只消费 active build
  - superseded / failed build 已具备后台 GC
- 不建议继续写“publish fencing 仍待评估”，更准确的说法是：
  - `publish_generation` 已落库
  - `activeIndexVersionId` 切换已带 compare-and-set 约束
  - 剩余重点已转向复杂链路测试覆盖，而不是核心发布机制本身

---

## 当前建议的一句话结论

项目当前真正的短板，已经从“数据库结构未落地”“运行时错误处理不统一”“组件层 `getState()` 直读”“缺少功能域错误边界”“VLM 完全无测试”转向“更多高风险前端页面/组件测试、i18n 完整性，以及文档版本切换/backfill/recovery 组合链路的高阶测试覆盖”。
