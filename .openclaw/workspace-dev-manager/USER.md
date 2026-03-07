# 项目上下文

## 项目概述

KnowledgeAgent 是一个 RAG（检索增强生成）应用，支持文档上传、文本提取、向量嵌入和语义搜索。采用 React 前端 + Express 后端架构，通过 pnpm monorepo 管理。

## 技术栈

### 前端（packages/client）

- React 19 + TypeScript（严格模式）
- Vite 构建工具，开发代理 `/api` → `http://localhost:3000`
- Tailwind CSS + shadcn/ui（New York 风格，Lucide 图标）
- TanStack Router（文件路由）+ TanStack Query（服务端状态）
- Zustand 客户端状态管理
- i18next 国际化，next-themes 主题切换
- HTTP 层：Axios API 客户端 + Fetch SSE 流式通信
- 路径别名：`@/*` → `./src/*`

### 后端（packages/server）

- Express 5 + TypeScript
- Drizzle ORM + MySQL
- Redis（ioredis）缓存/限流/会话
- Qdrant 向量存储
- JWT 认证（access 15min / refresh 7d）
- Pino 结构化日志（自动脱敏）
- 模块化架构：controllers → services → repositories
- 路径别名：`@shared/*`、`@modules/*`、`@config/*`

### 共享包（packages/shared）

- `@knowledge-agent/shared/types` — TypeScript 接口和类型
- `@knowledge-agent/shared/constants` — HTTP 状态码、错误码常量
- `@knowledge-agent/shared/schemas` — Zod 验证 schema
- `@knowledge-agent/shared/utils` — 通用工具函数

## 用户偏好

- **语言**：中文
- **Git 提交**：遵循 Conventional Commits 规范，提交信息中不包含任何 Claude 相关信息
- **包管理器**：pnpm
- **TypeScript**：严格模式，`noUncheckedIndexedAccess` 和 `noImplicitOverride` 启用
- **代码格式**：Prettier 单引号、100 字符宽度、2 空格缩进、ES5 尾逗号、LF 换行
- **ESLint**：flat config（v9+），`@typescript-eslint/no-explicit-any: warn`，未使用变量允许 `_` 前缀

## 关键架构模式

### 错误处理

使用 `AppError` 类 + `Errors` 工厂，不直接抛出原始 Error。

### 验证

所有输入通过 Zod schema + 中间件验证后再进入业务逻辑。

### 状态管理

- 服务端状态：TanStack Query + 键工厂（`src/lib/query/keys.ts`）
- 客户端状态：Zustand store + 选择器模式

### 测试

Vitest 框架，支持 `pnpm test`、`pnpm test:server`、`pnpm test:shared`。

### 安全

- JWT access/refresh token 模式
- CSRF 双提交令牌
- Redis Lua 脚本限流
- Pino 自动脱敏令牌/密钥/PII
