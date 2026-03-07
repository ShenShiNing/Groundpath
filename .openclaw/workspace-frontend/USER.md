# 项目上下文与用户偏好

## 项目信息

- **项目名称**：KnowledgeAgent
- **项目类型**：RAG（检索增强生成）应用
- **核心功能**：文档上传、文本提取、向量嵌入、语义搜索、AI 对话、知识库管理

## 技术栈概要

### 前端 (packages/client)

- React 19 + TypeScript (strict mode)
- Vite 构建工具，开发代理（`/api` -> `http://localhost:3000`）
- TanStack Router（文件路由 `src/routes/`）+ TanStack Query（服务端状态）
- Zustand（客户端状态 `src/stores/`）
- Tailwind CSS + shadcn/ui（New York style, Lucide icons）
- OKLch 颜色变量主题系统
- CVA（class-variance-authority）变体样式
- i18next + react-i18next（国际化，命名空间翻译）
- next-themes（暗色/亮色主题切换）
- Sonner（Toast 通知）
- HTTP 层：api-client.ts（Axios）、stream-client.ts（SSE）、sse.ts（事件解析）
- 认证：tokenAccessors 模式（`src/lib/http/auth.ts`）

### 后端 (packages/server)

- Express 5 + TypeScript
- Drizzle ORM + MySQL
- Redis（缓存、限流、会话）
- Qdrant（向量存储）
- JWT 认证（access/refresh token）
- Pino（结构化日志）

### 共享 (packages/shared)

- 类型定义：`@knowledge-agent/shared/types`
- 常量：`@knowledge-agent/shared/constants`
- Zod 校验：`@knowledge-agent/shared/schemas`
- 工具函数：`@knowledge-agent/shared/utils`

### 基础设施

- pnpm monorepo（三个 workspace 包）
- Husky + lint-staged（提交前检查）
- Vitest（测试框架）

## 前端关键路径别名

- `@/*` -> `./src/*`

## 前端关键目录结构

```
packages/client/src/
├── components/       # 通用组件
│   └── ui/           # shadcn/ui 基础组件
├── routes/           # TanStack Router 文件路由
├── stores/           # Zustand 状态存储
├── lib/
│   ├── http/         # HTTP 与 SSE 通信层
│   ├── query/        # React Query key 工厂
│   └── utils.ts      # cn() 工具函数
├── hooks/            # 自定义 Hooks
└── locales/          # i18n 翻译文件
```

## 用户偏好

- **沟通语言**：中文
- **提交规范**：Conventional Commits，提交信息中不包含任何 Claude 相关归属信息
- **包管理器**：pnpm
- **TypeScript**：严格模式，启用 `noUncheckedIndexedAccess`
- **代码风格**：
  - Prettier：单引号、100 字符宽度、2 空格缩进、ES5 尾逗号、LF 换行
  - ESLint：flat config (v9+)
- **Git 工作流**：完成阶段性功能后自动提交并推送，遵循 Conventional Commits
