# KnowledgeAgent 项目实现说明（简历/面试版）

## 1. 项目介绍

KnowledgeAgent 是一个面向个人知识管理场景的 RAG（Retrieval-Augmented Generation）应用。  
用户可以创建知识库、上传文档（PDF/DOCX/Markdown/TXT）、自动解析并向量化，再通过聊天页面进行语义问答并查看引用来源。

项目采用 `pnpm` monorepo，包含：

- `packages/client`：React + Vite 前端
- `packages/server`：Express + TypeScript 后端
- `packages/shared`：前后端共享类型、常量与 Zod 契约

当前代码特征（基于仓库现状）：

- 12 个后端业务模块（`auth/chat/document/rag/vector/...`）
- 80+ API 路由（`router.get/post/patch/delete` 聚合）
- 29 个测试文件（`packages/server/tests` 与 `packages/shared/tests`）
- 完整文档生命周期：上传、编辑、版本、回收站、恢复、永久删除
- 支持多模型提供商（OpenAI/Anthropic/DeepSeek/Ollama/Zhipu/Custom）

---

## 2. 总体架构

### 2.1 分层与目录

```text
client (React)
  ├─ routes/pages/components/stores/hooks
  └─ api + lib(http/query)

server (Express)
  ├─ modules/*           # 业务模块（controller/service/repository）
  ├─ shared/middleware   # 鉴权、限流、校验、安全
  ├─ shared/db/schema    # Drizzle schema
  └─ shared/logger       # 请求/操作/系统日志

shared
  ├─ types
  ├─ constants
  ├─ schemas (Zod)
  └─ utils
```

### 2.2 请求主链路

1. 前端通过 `api/*` 调用后端接口，响应结构统一为 `ApiResponse`。
2. 后端统一入口 `packages/server/src/index.ts` 注册安全中间件、请求日志、中间件校验、路由与错误处理。
3. 业务按 `controller -> service -> repository` 分层，数据落地到 MySQL（Drizzle）与 Qdrant。
4. RAG 场景下，聊天服务调用检索服务组装上下文，再走 LLM 生成并以 SSE 推流返回。

---

## 3. 核心功能与实现逻辑

## 3.1 认证与会话管理（Auth）

关键入口：

- `packages/server/src/modules/auth/auth.routes.ts`
- `packages/server/src/modules/auth/services/token.service.ts`
- `packages/server/src/shared/middleware/auth.middleware.ts`

实现逻辑：

1. 登录/注册/刷新/登出等接口由 `auth.routes.ts` 暴露，并挂载限流中间件。
2. Access Token + Refresh Token 双 token 机制。
3. Refresh 流程启用 token rotation：旧 refresh token 失效后签发新 token。
4. 内置 replay 风险检测（短时间重复使用同一 refresh token 会触发全量会话撤销）。
5. 支持会话列表与设备管理（查看当前设备/踢出指定设备/全部登出）。

安全点：

- IP 级接口限流 + 账号级失败尝试计数（防撞库/暴力破解）
- 被封禁用户直接拒绝访问
- refresh token 需同时验证 JWT 与数据库存储状态

---

## 3.2 邮箱验证码与 OAuth

关键入口：

- `packages/server/src/modules/auth/verification/email.routes.ts`
- `packages/server/src/modules/auth/verification/email-verification.service.ts`
- `packages/server/src/modules/auth/oauth/oauth.routes.ts`

实现逻辑：

1. 邮箱验证码发送与校验分离：`/send-code`、`/verify-code`。
2. 验证码生成使用 `crypto.randomInt`，并设置每小时发送上限与重发冷却。
3. 验证成功后签发短时 verification token（JWT），供注册/重置密码流程消费。
4. OAuth 支持 GitHub 与 Google 回调登录。

---

## 3.3 知识库管理（Knowledge Base）

关键入口：

- `packages/server/src/modules/knowledge-base/knowledge-base.routes.ts`
- `packages/server/src/modules/knowledge-base/services/knowledge-base.service.ts`

实现逻辑：

1. 创建知识库时绑定嵌入提供商（openai/zhipu/ollama），并固化对应 model + dimensions。
2. 生成集合名规则：`embedding_${provider}_${dimensions}`。
3. 嵌入配置在知识库维度不可变（更新仅允许改名称/描述）。
4. 维护 `documentCount`、`totalChunks` 计数器，供页面与系统统计使用。

---

## 3.4 文档管理（上传、编辑、版本、回收站）

关键入口：

- `packages/server/src/modules/document/document.routes.ts`
- `packages/server/src/modules/document/services/document.service.ts`
- `packages/server/src/modules/document/services/document-upload.service.ts`
- `packages/server/src/modules/document/services/document-content.service.ts`

实现逻辑：

1. 上传：`multer.memoryStorage` 接收文件，按 MIME + 扩展名双重校验。
2. 文件先写存储（Local/R2），再在事务中创建 `document + version` 记录并更新知识库计数。
3. 上传成功后异步触发 RAG 处理（分块、embedding、向量入库）。
4. 编辑（Markdown/TXT）会生成新版本并置 `processingStatus=pending`，再次触发异步处理。
5. 删除采用软删除 + 回收站；恢复/永久删除分别由 trash service 处理。

一致性策略：

- MySQL 关键步骤在事务内执行，失败可回滚。
- 存储已写入但事务失败时会做补偿删除。
- 向量删除失败时通过软删除标记避免被检索命中（最终一致性）。

---

## 3.5 RAG 处理流水线（Chunking + Embedding + Vector）

关键入口：

- `packages/server/src/modules/rag/services/chunking.service.ts`
- `packages/server/src/modules/rag/services/processing.service.ts`
- `packages/server/src/modules/rag/services/search.service.ts`
- `packages/server/src/modules/vector/vector.repository.ts`

实现逻辑：

1. 文本分块：段落优先、超长句子二次拆分、支持 overlap 与 offset 元数据。
2. 处理锁：内存锁 + 数据库状态双保险，避免同一文档并发重复处理。
3. 写入策略采用“先写新后删旧”：
   - 先生成新 embedding 并 upsert 到 Qdrant
   - 再事务写入新 chunk、删除旧 chunk、更新计数
   - 最后异步清理旧向量
4. 搜索时按 `userId + knowledgeBaseId + documentIds + scoreThreshold` 过滤，防止越权与噪声命中。

容错点：

- Qdrant 操作统一超时封装
- 物理删除失败时降级为软删除（`isDeleted=true`）
- 定时任务定期清理软删除向量

---

## 3.6 聊天与 SSE 流式输出

关键入口：

- `packages/server/src/modules/chat/services/chat.service.ts`
- `packages/server/src/modules/chat/chat.routes.ts`
- `packages/client/src/stores/chatPanelStore.ts`
- `packages/client/src/api/chat.ts`

实现逻辑：

1. 聊天消息写库后触发检索，构建系统提示词与上下文。
2. 服务端通过 SSE 推送 `chunk/sources/done/error` 事件。
3. 前端 store 增量拼接 assistant 内容，支持中断（AbortController）。
4. 首条消息自动生成会话标题，引用信息落在 message metadata 内。

体验点：

- 流式响应减少首屏等待时间
- 可按文档范围提问（`selectedDocumentIds`）
- 历史会话可切换并回放消息

---

## 3.7 Document-AI（摘要/分析/生成）

关键入口：

- `packages/server/src/modules/document-ai/document-ai.routes.ts`
- `packages/server/src/modules/document-ai/services/summary.service.ts`
- `packages/server/src/modules/document-ai/services/analysis.service.ts`
- `packages/server/src/modules/document-ai/services/generation.service.ts`

实现逻辑：

1. 摘要支持同步与流式两种模式。
2. 长文档自动切块后做分层摘要（chunk summary -> merge summary）。
3. 分析支持关键词、实体、结构提取。
4. 生成支持从 prompt 生成新内容或基于现有文档扩写。

---

## 3.8 存储与文件安全访问（Local/R2）

关键入口：

- `packages/server/src/modules/storage/storage.factory.ts`
- `packages/server/src/modules/storage/storage.controller.ts`
- `packages/server/src/modules/storage/providers/local.provider.ts`
- `packages/server/src/modules/storage/providers/r2.provider.ts`

实现逻辑：

1. 存储类型通过配置切换：开发默认 local，生产默认 r2。
2. 文件访问通过签名 URL（`sig + exp`）校验，开发可关闭签名便于调试。
3. 读取时包含路径穿越防护与流式 `pipeline` 输出。
4. 客户端断开连接时会主动销毁流，避免资源泄漏。

---

## 3.9 前端实现（路由、状态、数据请求）

关键入口：

- `packages/client/src/main.tsx`
- `packages/client/src/routes/index.ts`
- `packages/client/src/lib/http/index.ts`
- `packages/client/src/lib/query/keys.ts`
- `packages/client/src/hooks/*`

实现逻辑：

1. 基于 TanStack Router 做页面路由组织（含 auth、chat、knowledge-bases、documents）。
2. 基于 TanStack Query 管理服务端状态，统一 query key 工厂。
3. 基于 Zustand 维护高频交互状态（如聊天流、当前会话、文档范围）。
4. HTTP 层封装为 `apiClient + stream-client + sse parser`，普通请求与流式请求解耦。

---

## 3.10 共享契约（Shared Package）

关键入口：

- `packages/shared/src/schemas/index.ts`
- `packages/shared/src/types/*`
- `packages/shared/src/constants/*`

实现逻辑：

1. 前后端共享 TypeScript 类型与错误码，减少契约漂移。
2. Zod schema 在服务端做请求校验，前端可复用类型定义。
3. 统一的 `ApiResponse` 结构支撑接口处理与错误兜底。

---

## 3.11 日志、调度与运维

关键入口：

- `packages/server/src/shared/logger/*`
- `packages/server/src/modules/logs/services/log-cleanup.service.ts`
- `packages/server/src/shared/scheduler/index.ts`

实现逻辑：

1. 请求日志、操作日志、系统日志分层记录。
2. 关键业务动作（创建、更新、删除、下载等）异步写入操作日志。
3. 定时任务执行：日志清理、refresh token 清理、向量软删除清理、计数器校准。
4. 系统支持优雅停机，包含 DB 连接回收与超时兜底。

---

## 4. 数据模型概览（MySQL / Drizzle）

当前 schema 覆盖 15 张核心表，按域划分：

- User：`users`
- Auth：`user_auths`、`refresh_tokens`、`email_verification_codes`
- Document：`knowledge_bases`、`folders`、`documents`、`document_versions`、`document_chunks`
- AI：`llm_configs`、`conversations`、`messages`
- System：`login_logs`、`operation_logs`、`system_logs`

迁移位于：`packages/server/drizzle/*.sql`

---

## 5. 测试与质量控制

测试分布：

- `packages/server/tests/modules/*`：auth/chat/document/document-ai/knowledge-base/llm
- `packages/server/tests/shared/*`：错误处理与工具函数
- `packages/shared/tests/*`：共享工具测试

工程规范：

- TypeScript 严格模式
- ESLint + Prettier
- Husky + lint-staged（提交前自动检查并格式化）

---

## 6. 面试可重点讲的工程亮点

1. RAG 一致性设计：先写新向量再删旧向量 + 软删除兜底。
2. Token 安全：refresh rotation + replay 检测 + 会话级撤销。
3. 流式对话：SSE 协议、事件拆分、可中断与引用同步。
4. 文档事务与补偿：DB 事务 + 存储回滚补偿 + 异步处理解耦。
5. 多提供商抽象：LLM/Embedding provider 工厂化，支持云端与本地模型。

---

## 7. 当前边界与可演进方向

已具备：

- 单用户知识库闭环（创建 -> 上传 -> 处理 -> 对话 -> 引用）
- 完整基础安全与日志链路
- 可扩展的模型/向量/存储抽象

建议下一步：

1. 增加 CI 工作流（当前仓库暂无 `.github/workflows`）。
2. 增加检索质量评估基线（离线评测集 + 线上指标）。
3. 完善导入导出与数据迁移工具。
4. 增加前端 E2E 与关键链路监控告警。
