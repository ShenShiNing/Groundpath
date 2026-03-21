# Knowledge Agent — 代码库综合分析报告

> 生成日期：2026-03-21
> 代码量：~23,500 行 TypeScript（763 个源文件）
> 测试文件：154 个（Server 114 / Client 38 / Shared 2）

---

## 目录

1. [项目概览](#1-项目概览)
2. [技术栈](#2-技术栈)
3. [项目结构](#3-项目结构)
4. [后端架构分析](#4-后端架构分析)
5. [前端架构分析](#5-前端架构分析)
6. [共享包设计](#6-共享包设计)
7. [数据库设计](#7-数据库设计)
8. [配置与环境管理](#8-配置与环境管理)
9. [测试体系](#9-测试体系)
10. [代码质量工具链](#10-代码质量工具链)
11. [安全设计](#11-安全设计)
12. [可观测性与运维](#12-可观测性与运维)
13. [综合评分](#13-综合评分)
14. [优势总结](#14-优势总结)
15. [改进建议](#15-改进建议)

---

## 1. 项目概览

Knowledge Agent 是一个面向个人/团队的 **RAG（检索增强生成）知识管理平台**。用户可以：

- 创建知识库、上传文档（PDF / DOCX / Markdown / 纯文本）
- 文档自动向量化、结构化索引
- 基于知识库进行 AI 对话（支持引用来源）
- 文档 AI 功能（摘要、分析、生成、扩写）
- Agent 模式（工具调用：知识库搜索、网络搜索等）

**架构风格**：pnpm monorepo，前后端分离 + 共享类型包。

---

## 2. 技术栈

### 2.1 前端

| 类别 | 技术 |
|------|------|
| 框架 | React 19 + TypeScript 5.9 |
| 构建 | Vite 7.3 |
| 路由 | TanStack Router |
| 状态 | Zustand（客户端）+ TanStack Query（服务端） |
| 表单 | TanStack Form + Zod |
| UI | Radix UI + Tailwind CSS 4 + Lucide Icons |
| 国际化 | i18next |
| 主题 | next-themes（OKLCH 色彩系统） |
| HTTP | Axios（REST）+ fetch（SSE 流式） |

### 2.2 后端

| 类别 | 技术 |
|------|------|
| 运行时 | Node.js + Express 5 + TypeScript 5.9 |
| ORM | Drizzle ORM（MySQL） |
| 缓存 | Redis（ioredis） |
| 队列 | BullMQ |
| 定时任务 | node-cron |
| 日志 | Pino |
| API 文档 | Swagger / OpenAPI（zod-to-openapi） |
| 文件存储 | 本地 / Cloudflare R2（S3 兼容） |
| 向量数据库 | Qdrant |

### 2.3 AI 集成

| 类别 | 技术 |
|------|------|
| LLM | OpenAI / Anthropic Claude / 智谱 / DeepSeek / Ollama |
| Embedding | 智谱 / OpenAI / Ollama |
| VLM | OpenAI gpt-4o / Anthropic Claude |
| Agent | Claude Agent SDK + Tavily（网络搜索） |

### 2.4 质量工具

| 类别 | 技术 |
|------|------|
| 测试 | Vitest 4 + @vitest/coverage-v8 |
| Lint | ESLint 9 + typescript-eslint + Prettier |
| Git hooks | Husky + lint-staged |
| 架构检查 | dependency-cruiser |

---

## 3. 项目结构

```
knowledge-agent/
├── packages/
│   ├── client/                 # React 前端（~22,500 行）
│   │   ├── src/
│   │   │   ├── api/            # HTTP API 调用层（12 模块）
│   │   │   ├── components/     # UI 组件（按功能域分组）
│   │   │   │   ├── auth/       # 认证（登录、注册、忘记密码）
│   │   │   │   ├── chat/       # 聊天界面
│   │   │   │   ├── documents/  # 文档阅读/编辑/上传
│   │   │   │   ├── layout/     # 全局布局、侧边栏
│   │   │   │   ├── ui/         # 27 个基础 UI 组件
│   │   │   │   └── ...
│   │   │   ├── hooks/          # 自定义 Hooks
│   │   │   ├── lib/            # 工具库（HTTP 客户端、流处理）
│   │   │   ├── pages/          # 页面组件
│   │   │   ├── routes/         # TanStack Router 路由定义
│   │   │   └── stores/         # Zustand 状态管理
│   │   └── tests/              # 前端测试
│   │
│   ├── server/                 # Express 后端（~31,800 行）
│   │   ├── src/
│   │   │   ├── core/           # 基础设施层
│   │   │   │   ├── config/     # 环境 + 默认值配置
│   │   │   │   ├── db/         # 数据库连接 + Schema
│   │   │   │   ├── middleware/ # Express 中间件
│   │   │   │   ├── errors/     # 错误类型体系
│   │   │   │   ├── logger/     # 日志系统
│   │   │   │   ├── queue/      # BullMQ 配置
│   │   │   │   ├── redis/      # Redis 连接
│   │   │   │   ├── scheduler/  # 定时任务
│   │   │   │   └── ...
│   │   │   └── modules/        # 功能模块层（14 个模块）
│   │   │       ├── agent/      # Agent 执行器 + 工具
│   │   │       ├── auth/       # 认证与授权
│   │   │       ├── chat/       # 聊天会话
│   │   │       ├── document/   # 文档管理
│   │   │       ├── document-ai/# 文档 AI
│   │   │       ├── document-index/ # 结构化索引
│   │   │       ├── embedding/  # 向量化
│   │   │       ├── knowledge-base/ # 知识库
│   │   │       ├── rag/        # RAG 检索 + 处理管道
│   │   │       ├── vector/     # Qdrant 操作
│   │   │       └── ...
│   │   ├── drizzle/            # SQL 迁移文件
│   │   └── tests/              # 后端测试
│   │
│   └── shared/                 # 共享类型包
│       └── src/
│           ├── schemas/        # Zod 验证模式
│           ├── types/          # TypeScript 类型
│           ├── constants/      # 共享常量
│           └── utils/          # 工具函数
│
├── docs/                       # 项目文档
├── vitest.config.ts            # 根测试配置
├── eslint.config.js            # ESLint 配置
├── .dependency-cruiser.cjs     # 架构规则
└── pnpm-workspace.yaml         # Monorepo 配置
```

---

## 4. 后端架构分析

### 4.1 分层架构

```
HTTP Request
  │
  ├─ Middleware（Helmet → CORS → RequestID → Logger → JSON → Cookie → Sanitize）
  │
  ├─ Routes → Controller（请求解析、验证、响应格式）
  │              │
  │              └─ Service（业务逻辑、事务编排）
  │                    │
  │                    └─ Repository（数据访问、SQL 查询）
  │
  ├─ OpenAPI Docs
  │
  └─ Error Handler（全局错误处理）
```

**评价**：严格的四层分层，依赖方向单向。dependency-cruiser 规则强制执行：
- Controller 不能直接访问 Repository
- 跨模块导入必须通过 barrel（index.ts）
- 共享代码不依赖功能模块

### 4.2 模块设计

每个功能模块遵循一致的内部结构：

```
modules/auth/
├── controllers/    # HTTP 处理器
├── services/       # 业务逻辑（可能多个）
├── repositories/   # 数据访问
├── auth.routes.ts  # 路由 + 中间件链
└── index.ts        # Barrel 导出
```

**12 个 API 路由模块**通过声明式注册：

```typescript
const apiRouteModules = [
  { id: 'auth',    basePath: '/api/auth',    router: authRoutes },
  { id: 'chat',    basePath: '/api/chat',    router: chatRoutes },
  { id: 'document', basePath: '/api/documents', router: documentRoutes },
  // ...
];
```

### 4.3 异步处理架构

```
文档上传 → BullMQ 队列 → Worker（并发度可配）
                │
                ├─ 文本提取（PDF/DOCX/MD/TXT）
                ├─ 分块（chunking）
                ├─ 向量化（embedding）
                ├─ 结构化索引（可选）
                └─ 状态更新

定时任务（node-cron）：
  ├─ 日志清理（3:00 AM UTC）
  ├─ 计数器同步（周日 4:00 AM）
  ├─ 处理恢复（每 10 分钟）
  └─ 索引回填（可配置）
```

**幂等性保证**：
- BullMQ 使用语义化 Job ID（`doc-{id}-v{version}-idx-{ver}`），自动去重
- Redis 分布式锁防止并发处理同一文档
- 失败重试使用指数退避

### 4.4 启动与关闭

```
启动流程：
  1. 连接 Redis
  2. 创建 Express app + 注册中间件
  3. 启动 HTTP 服务器
  4. 初始化定时任务
  5. 启动文档处理 Worker

优雅关闭：
  SIGTERM/SIGINT → 停止接受新请求 → 等待进行中请求 → 关闭 Worker → 关闭 Redis → 退出
```

### 4.5 文件大小分析（后端 Top 10）

| 文件 | 行数 | 状态 |
|------|------|------|
| `scripts/db-consistency-check/checks.ts` | 433 | ⚠️ 超限（脚本，可接受） |
| `vector/vector.repository.ts` | 431 | ⚠️ 超限 |
| `document-ai/services/analysis.service.ts` | 404 | ⚠️ 超限 |
| `rag/services/processing.executor.ts` | 395 | ✅ 接近限制 |
| `logs/services/structured-rag-dashboard.service.ts` | 393 | ✅ 接近限制 |
| `knowledge-base/services/knowledge-base.service.ts` | 380 | ✅ 接近限制 |
| `document/controllers/document.controller.ts` | 367 | ✅ 可控 |
| `chat/repositories/message.repository.ts` | 363 | ✅ 可控 |
| `document-ai/services/summary.service.ts` | 358 | ✅ 可控 |
| `document/services/document-storage.service.ts` | 347 | ✅ 可控 |

> 项目规范：~400 行上限。3 个文件轻微超限，总体控制良好。

---

## 5. 前端架构分析

### 5.1 数据流架构

```
┌─────────────────────────────────────────┐
│              React Components           │
│  ┌───────────┐  ┌────────────────────┐  │
│  │  Zustand   │  │  TanStack Query    │  │
│  │  Stores    │  │  (Server State)    │  │
│  │            │  │                    │  │
│  │ • authStore│  │ • useConversations │  │
│  │ • chatPanel│  │ • useDocuments     │  │
│  │ • userStore│  │ • useLLMConfig     │  │
│  └──────┬─────┘  └────────┬───────────┘  │
│         │                 │              │
│         └─────────┬───────┘              │
│                   │                      │
│         ┌─────────▼──────────┐           │
│         │   API Layer        │           │
│         │   (Axios + fetch)  │           │
│         └─────────┬──────────┘           │
└───────────────────┼──────────────────────┘
                    │
              HTTP / SSE
                    │
              Express Server
```

**评价**：
- 客户端状态（Zustand）与服务端状态（React Query）职责清晰
- `accessToken` 仅存在内存中，不持久化（安全最佳实践）
- SSE 流式处理独立于 Axios，使用原生 fetch

### 5.2 路由设计

- 基于文件的路由（TanStack Router `.route.tsx` 约定）
- `authenticated.route.tsx` 统一认证守卫
- Route-level 代码分割自动生效

### 5.3 组件组织

```
组件按功能域分组：
  auth/       → 10 个组件（登录、注册、OAuth、密码重置）
  chat/       → 15+ 个组件（消息、输入、引用、工具步骤）
  documents/  → 文档阅读器、上传、AI 重写
  layout/     → 全局布局、侧边栏、用户菜单
  ui/         → 27 个基础组件（button, card, dialog, input...）
```

**设计模式**：
- 大页面拆分为子组件 + Controller Hook（如 `useChatPageController`）
- `memo()` + `useCallback` / `useMemo` 优化渲染（130+ 处使用）
- 懒加载重型组件（md-editor、PDF viewer）

### 5.4 Bundle 优化

```javascript
// vite.config.ts — 手动分块
manualChunks: {
  'tanstack': '@tanstack/*',
  'radix':    '@radix-ui/*',
  'md-editor': '@uiw/*',
  'pdfjs':    'pdfjs-dist',
  'react':    'react|react-dom',
}
```

### 5.5 文件大小分析（前端 Top 10）

| 文件 | 行数 | 状态 |
|------|------|------|
| `pages/chat-page/useChatPageController.ts` | 458 | ⚠️ 超限 |
| `stores/chatPanelStore.ts` | 434 | ⚠️ 超限 |
| `hooks/useDocuments.ts` | 432 | ⚠️ 超限 |
| `pages/documents/DocumentDetailPage.tsx` | 426 | ⚠️ 超限 |
| `pages/Home.tsx` | 381 | ✅ 接近限制 |
| `pages/documents/TrashPage.tsx` | 374 | ✅ 接近限制 |
| `security/ChangePasswordForm.tsx` | 353 | ✅ 可控 |
| `security/AccountEmailForm.tsx` | 350 | ✅ 可控 |
| `layout/AppSidebar.tsx` | 313 | ✅ 可控 |
| `chat/ChatMessage.tsx` | 305 | ✅ 可控 |

> 4 个文件超过 400 行限制，需要进一步拆分。

---

## 6. 共享包设计

```
packages/shared/
├── schemas/     # Zod 验证模式（前后端共用）
├── types/       # TypeScript 类型定义
├── constants/   # 枚举、常量
└── utils/       # 纯函数工具
```

**评价**：
- 单一数据契约（Single Source of Truth）：验证逻辑只写一次
- 前后端类型一致性通过编译时保证
- 构建输出 `.d.ts` 声明文件供消费

---

## 7. 数据库设计

### 7.1 Schema 组织

```
core/db/schema/
├── user/       → users
├── auth/       → user_auths, refresh_tokens, email_verification_codes,
│                 oauth_exchange_codes, user_token_states
├── document/   → knowledge_bases, documents, document_versions,
│                 document_chunks, document_nodes, document_node_contents,
│                 document_edges, document_index_versions,
│                 document_index_backfill_runs, document_index_backfill_items
├── ai/         → llm_configs, conversations, messages
└── system/     → login_logs, operation_logs, system_logs
```

### 7.2 设计特点

| 特性 | 实现 |
|------|------|
| 主键 | UUID |
| 软删除 | `deletedAt` / `deletedBy` 字段 |
| 审计字段 | `createdAt/By`, `updatedAt/By` |
| 版本控制 | `document_versions` 表 + 版本号字段 |
| 索引策略 | 复合索引（状态+用户+删除标记） |
| 关系管理 | Drizzle relations |

### 7.3 迁移管理

- Drizzle Kit 生成 SQL 迁移（`drizzle/` 目录，0000-0007）
- `db:drift-check` 脚本检测 Schema 漂移（pre-push hook 自动执行）
- `db:consistency-check` 脚本验证数据完整性

---

## 8. 配置与环境管理

### 8.1 配置架构

```
环境变量（.env）  +  业务默认值（defaults/*.ts）
        │                      │
        ▼                      ▼
   env/schema.ts         defaults/index.ts
   （Zod 验证）          （as const 常量）
        │                      │
        └─────────┬────────────┘
                  ▼
           env/configs.ts
        （合并导出，单一公共 API）
```

### 8.2 环境验证

**17 个 Zod Schema** 覆盖所有基础设施和业务配置：
- Server、Database、Redis、Auth、Email、OAuth
- Storage、Embedding、Vector、LLM、VLM、Agent
- Queue、Logging、Feature Flags、Schedule 等

强制约束示例：
```typescript
JWT_SECRET: z.string().min(32)     // 强制 32+ 字符
ENCRYPTION_KEY: z.string().min(32)
NODE_ENV: z.enum(['development', 'production', 'test'])
```

### 8.3 Feature Flags

12+ 个功能标记支持渐进式发布：
- `STRUCTURED_RAG_ENABLED` / `STRUCTURED_RAG_ROLLOUT_MODE`
- `IMAGE_DESCRIPTION_ENABLED`
- `DOCUMENT_PROCESSING_RECOVERY_ENABLED`
- `DISABLE_RATE_LIMIT`（仅测试）

---

## 9. 测试体系

### 9.1 测试金字塔

```
           △
          / \         E2E 测试（4 个）
         / E \        完整 Express + HTTP
        /─────\
       / Int.  \      集成测试（4 个）
      / (Real   \     真实 DB + Redis
     /  DB/Redis) \
    /──────────────\
   /    Unit Tests  \   单元测试（~146 个）
  / (Heavy Mocking)  \  所有依赖 Mock
 /────────────────────\
```

### 9.2 覆盖分布

| 包 | 测试文件 | 源文件 | 比率 |
|----|---------:|-------:|------|
| Server | 114 | ~450 | 25% |
| Client | 38 | ~260 | 15% |
| Shared | 2 | ~50 | 4% |

### 9.3 测试模式

**单元测试**（`tests/modules/`）：
- 使用 `vi.mock()` + `vi.hoisted()` 完全隔离
- 每个服务方法有多场景覆盖（如登录测试 22 个场景）
- 共享 Mock 库（`tests/__mocks__/`）
- `logTestInfo()` 辅助调试

**集成测试**（`tests/integration/`）：
- 真实 MySQL + Redis 连接
- 条件执行（`RUN_REAL_*_INTEGRATION` 环境变量）
- 端到端流程验证（文档索引回填等）

**E2E 测试**（`tests/e2e/`）：
- 启动完整 Express 服务器（随机端口）
- `smoke-auth` / `smoke-chat` / `smoke-kb-document` / `smoke-trash`
- 丰富的 helper 函数（`jsonFetch`, `authFetch`, `authPost` 等）

**前端测试**（`client/tests/`）：
- 组件测试（jsdom 环境）
- Hook 测试
- Store 测试
- API 调用测试

### 9.4 测试基础设施评价

| 方面 | 评分 | 说明 |
|------|:----:|------|
| 框架选型 | ⭐⭐⭐⭐⭐ | Vitest 配置健全，多项目支持 |
| 单元测试 | ⭐⭐⭐⭐⭐ | Mock 库完善，场景覆盖全面 |
| 集成测试 | ⭐⭐⭐⭐ | 有真实 DB 测试，覆盖关键路径 |
| E2E 测试 | ⭐⭐⭐ | 4 个 smoke 测试，可扩展 |
| 前端测试 | ⭐⭐⭐ | 有基础覆盖，复杂 Hook 测试不足 |

---

## 10. 代码质量工具链

### 10.1 静态分析

```
ESLint 9 + typescript-eslint
  ├─ @tanstack/eslint-plugin-query   # React Query 最佳实践
  ├─ eslint-plugin-react-hooks       # Hooks 规则
  └─ eslint-config-prettier          # 与 Prettier 无冲突

Prettier
  ├─ singleQuote: true
  ├─ printWidth: 100
  └─ trailingComma: "es5"

TypeScript（严格模式）
  ├─ strict: true
  ├─ noUnusedLocals: true
  └─ noUnusedParameters: true
```

### 10.2 架构守护（dependency-cruiser）

6 条强制规则：

| 规则 | 级别 | 说明 |
|------|------|------|
| `no-circular` | ❌ Error | 禁止循环依赖 |
| `no-controller-to-repository` | ❌ Error | Controller 必须经过 Service |
| `no-cross-module-controller-import` | ❌ Error | 路由只导入同模块 Controller |
| `no-orphans` | ⚠️ Warn | 检测孤立文件 |
| `no-shared-to-modules` | ❌ Error | 共享层不依赖功能模块 |
| `no-cross-module-deep-import` | ⚠️ Warn | 跨模块应通过 barrel 导入 |

### 10.3 Git Hooks

```
pre-commit（Husky + lint-staged）:
  → ESLint --fix + Prettier（仅暂存文件）

pre-push:
  → db:drift-check（检查 Schema 漂移）
```

---

## 11. 安全设计

### 11.1 认证体系

```
双 Token 机制：
  Access Token（JWT，短期）→ 内存存储，每次请求附带
  Refresh Token（长期）→ HttpOnly Cookie + 数据库记录

Token 撤销：
  用户级 tokenValidAfterEpoch + 会话级 DB 验证 + 时钟偏差容忍

OAuth 集成：
  GitHub + Google（Exchange Code 加密传输）
```

### 11.2 防御措施

| 威胁 | 防御 |
|------|------|
| XSS | Helmet CSP + 输入清洗（HTML 标签移除） |
| CSRF | Cookie SameSite + CSRF Token 验证 |
| 暴力破解 | Redis-backed 速率限制（登录/注册/邮件/AI） |
| SQL 注入 | Drizzle ORM 参数化查询 |
| 路径遍历 | 文件签名验证 + `../` 检测 |
| 密码泄露 | bcryptjs hash（可配置 salt 轮数） |
| Token 泄露 | accessToken 不持久化 + HttpOnly Cookie |

### 11.3 文件安全

- HMAC-SHA256 签名 URL（过期时间 + 路径验证）
- 流式下载（背压处理 + 客户端断连清理）
- Content-Disposition 头（防止浏览器直接执行）

---

## 12. 可观测性与运维

### 12.1 日志系统

```
Pino JSON Logger
  ├─ Request Logger（HTTP 级别，pino-http）
  ├─ System Logger（启动/关闭/调度）
  ├─ Operation Logger（业务事件）
  └─ 级别：fatal | error | warn | info | debug | trace | silent
```

### 12.2 指标追踪

结构化 RAG 观测指标：
- Agent 执行（工具调用数、持续时间、停止原因）
- 聊天（流式 vs 非流式、Agent vs Legacy 模式）
- 索引构建（解析方法、成功/失败原因）
- 图像描述（成功率）

### 12.3 运维脚本

| 脚本 | 用途 |
|------|------|
| `db:drift-check` | 检测 Schema 漂移 |
| `db:consistency-check` | 数据完整性校验 |
| `db:sync-counters` | 统计计数器修正 |
| `document-index:backfill` | 索引回填 |
| `db:migrate` | 迁移执行 |

### 12.4 缺失项

- ❌ Dockerfile / docker-compose
- ❌ GitHub Actions / CI 管道
- ❌ 健康检查端点（readiness/liveness）
- ❌ APM / 链路追踪集成

---

## 13. 综合评分

| 维度 | 评分 | 说明 |
|------|:----:|------|
| **架构设计** | ⭐⭐⭐⭐⭐ | 分层清晰、模块独立、依赖规则强制 |
| **代码组织** | ⭐⭐⭐⭐½ | 结构一致，少数文件超限 |
| **类型安全** | ⭐⭐⭐⭐⭐ | 严格 TS + Zod 端到端验证 |
| **安全设计** | ⭐⭐⭐⭐⭐ | 多层防御，Token 管理规范 |
| **配置管理** | ⭐⭐⭐⭐⭐ | Zod Schema 验证 + 分层默认值 |
| **测试覆盖** | ⭐⭐⭐⭐ | 单元测试优秀，E2E/前端可加强 |
| **错误处理** | ⭐⭐⭐⭐⭐ | 统一 AppError 体系，全局兜底 |
| **性能优化** | ⭐⭐⭐⭐ | 代码分割、memoization、连接池 |
| **可观测性** | ⭐⭐⭐½ | 日志完善，缺 APM/链路追踪 |
| **DevOps** | ⭐⭐½ | 无 Docker/CI，依赖本地开发 |
| **文档** | ⭐⭐⭐ | 有 env 文档和 CLAUDE.md，缺架构文档 |
| **代码复用** | ⭐⭐⭐⭐½ | 共享包设计好，少量重复逻辑 |

**总体评分：4.2 / 5** — 企业级水准的全栈 RAG 应用，架构成熟度高。

---

## 14. 优势总结

1. **架构规范性强**：dependency-cruiser 强制分层规则，杜绝架构腐化
2. **端到端类型安全**：Zod Schema 从验证到类型一体化，前后端契约统一
3. **安全意识到位**：双 Token + CSRF + 速率限制 + 输入清洗 + 文件签名
4. **异步处理健壮**：BullMQ 幂等队列 + Redis 分布式锁 + 处理恢复机制
5. **配置管理专业**：Zod 验证环境变量 + 分层默认值 + Feature Flags
6. **代码质量工具完备**：ESLint + Prettier + Husky + lint-staged + 架构检查
7. **AI 集成灵活**：多 LLM/Embedding 提供商 + Agent 工具调用 + 流式响应
8. **错误处理一致**：统一 AppError 类 + 全局中间件 + 类型化 API 错误

---

## 15. 改进建议

### P0 — 高优先级

| 编号 | 建议 | 说明 |
|:----:|------|------|
| 1 | **添加 Docker 配置** | 缺少 Dockerfile 和 docker-compose，新成员上手困难，生产部署缺乏标准化 |
| 2 | **建立 CI/CD 管道** | 无 GitHub Actions，测试/lint/构建/部署全靠手动，PR 质量无自动保障 |
| 3 | **添加健康检查端点** | 缺少 `/health`（readiness/liveness），生产环境无法被编排系统监控 |

### P1 — 中优先级

| 编号 | 建议 | 说明 |
|:----:|------|------|
| 4 | **拆分超限文件** | 7 个文件 >400 行（详见 4.5 和 5.5），建议拆分以保持可维护性 |
| 5 | **扩展前端测试** | 复杂 Hook（`useChatPageController`）和流式逻辑缺少测试覆盖 |
| 6 | **增加 E2E 测试** | 当前仅 4 个 smoke 测试，建议覆盖核心用户流程（文档上传→向量化→对话） |
| 7 | **添加 APM/链路追踪** | 当前仅有结构化日志，缺少请求链路追踪能力（如 OpenTelemetry） |

### P2 — 低优先级

| 编号 | 建议 | 说明 |
|:----:|------|------|
| 8 | **chatPanelStore 职责拆分** | 同时管理 UI 状态、数据、副作用，可拆为 UI Store + Data Store |
| 9 | **SSE 流式处理抽象** | 流处理逻辑分散在多个文件，可考虑统一 Observable 模式 |
| 10 | **补充架构文档** | 缺少 ADR（Architecture Decision Records）和系统架构图 |
| 11 | **类型转换统一** | 前端存在多个相似转换函数（`toStoreMessage`, `toStoreCitation`），可合并 |

---

*本报告基于代码库截至 2026-03-21 的快照生成。*
