# USER — 项目上下文

## 项目概览

KnowledgeAgent 是一个 RAG（检索增强生成）应用，支持文档上传、文本提取、向量嵌入和跨知识库语义搜索。采用 pnpm 工作区管理的 monorepo 结构。

## 技术栈

### 前端（`packages/client`）

- **React 19** + TypeScript（严格模式）
- **Vite** 构建工具，开发代理（`/api` → `http://localhost:3000`）
- **Tailwind CSS** + OKLch 颜色变量主题系统
- **shadcn/ui** 组件库（New York 风格，Lucide 图标）
- **TanStack Router** 文件路由（`src/routes/`）
- **TanStack Query** 服务端状态管理 + 层级 key 工厂（`src/lib/query/keys.ts`）
- **Zustand** 客户端状态（`src/stores/`）
- **i18next** + react-i18next 国际化（命名空间翻译，浏览器语言检测）
- **next-themes** 暗/亮模式切换

### 前端关键模式

- 路径别名：`@/*` → `./src/*`
- `cn()` 工具函数（clsx + tailwind-merge）
- CVA（class-variance-authority）变体样式
- HTTP 层：`api-client.ts`（Axios + token 注入 + 401 重试）、`stream-client.ts`（SSE 流式）、`sse.ts`（SSE 解析与分发）
- Zustand stores：`authStore`、`userStore`、`chatPanelStore`、`aiSettingsStore`

### 后端（`packages/server`）

- **Express 5** + TypeScript
- **tsx** 开发热重载
- **Drizzle ORM** + MySQL
- **Redis**（ioredis）限流、缓存、会话
- **Qdrant** 向量存储
- **JWT** access/refresh token 认证
- **Pino** 结构化日志（自动脱敏）

### 后端架构

```
packages/server/src/
├── modules/            # 功能模块（垂直切片）
│   ├── agent/          # Agent 执行器 + 工具系统
│   ├── auth/           # 认证、OAuth、邮箱验证
│   ├── user/           # 用户管理
│   ├── document/       # 文档 CRUD、版本、文件夹
│   ├── document-ai/    # AI 摘要、分析、生成（SSE 流式）
│   ├── knowledge-base/ # 知识库管理
│   ├── embedding/      # 嵌入服务（OpenAI、智谱、Ollama）
│   ├── vector/         # Qdrant 向量操作
│   ├── rag/            # 文档处理、分块、搜索
│   ├── llm/            # LLM 提供商（OpenAI、Anthropic、DeepSeek、智谱、Ollama、自定义）
│   ├── chat/           # 对话、消息历史、提示组装
│   ├── storage/        # 文件存储（本地、R2）
│   └── logs/           # 操作/登录/系统日志
├── shared/
│   ├── cache/          # Redis 缓存服务（namespace 隔离 + TTL）
│   ├── config/         # 环境配置（模块化导出）
│   ├── db/             # 数据库连接与 schema
│   ├── errors/         # AppError + Errors 工厂
│   ├── logger/         # Pino 日志
│   ├── middleware/      # 认证、校验、限流、CSRF、消毒
│   ├── redis/          # Redis 客户端单例
│   ├── scheduler/      # 定时任务
│   └── utils/          # JWT、分页、cookie 等工具
└── router.ts           # 主路由聚合
```

模块遵循：`controllers/` → `services/` → `repositories/` 模式

### 共享包（`packages/shared`）

- `@knowledge-agent/shared/types` — TypeScript 接口（`ApiResponse<T>` 联合类型 + 类型守卫）
- `@knowledge-agent/shared/constants` — HTTP 状态码、错误码（`AUTH_ERROR_CODES`、`DOCUMENT_ERROR_CODES` 等）
- `@knowledge-agent/shared/schemas` — Zod 校验 schema
- `@knowledge-agent/shared/utils` — 工具函数

### API 路由

```
/api/auth           — 登录、注册、登出、刷新、密码
/api/auth/email     — 邮箱验证
/api/auth/oauth     — GitHub/Google OAuth
/api/user           — 用户管理
/api/documents      — 文档 CRUD
/api/knowledge-bases — 知识库管理
/api/rag            — 文档处理 & 语义搜索
/api/llm            — LLM 配置 & 模型列表
/api/chat           — 对话 & SSE 消息流
/api/document-ai    — AI 摘要、分析、生成
/api/logs           — 审计 & 操作日志
/api/files/*        — 签名文件访问
```

## 用户偏好

- **Git 提交**：不在 commit 信息中包含任何 Claude 相关信息
- **语言**：中文回答和文档
- **代码风格**：Prettier（单引号、100 字符宽、2 空格缩进、ES5 尾逗号、LF 换行）
- **ESLint**：flat config v9+，`@typescript-eslint/no-explicit-any: warn`，未使用变量允许 `_` 前缀

## 关键架构约束

1. 跨模块导入使用 barrel 导出（`@modules/foo`），避免跨层深度导入
2. 共享类型/常量来自 `@knowledge-agent/shared/*`，不重复定义
3. 多步流程在单个 service 中编排，避免分散的副作用
4. 计数器更新必须幂等，带有 floor protection
5. 使用 `AppError` / `Errors` 工厂返回错误
6. 外部调用必须有超时和错误处理
7. 所有输入通过 Zod/middleware 校验后才进入业务逻辑
8. 日志不记录 tokens/keys/PII
9. 一致性敏感流程使用数据库事务或实体级互斥锁
10. 可调参数通过 config 管理，不硬编码
