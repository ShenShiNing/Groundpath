# 项目上下文与用户偏好

## 项目信息

- **项目名称**：KnowledgeAgent
- **项目类型**：RAG（检索增强生成）应用
- **核心功能**：文档上传、文本提取、向量嵌入、语义搜索、AI 对话、知识库管理

## 技术栈概要

### 前端 (packages/client)

- React 19 + TypeScript (strict mode)
- Vite 构建工具
- TanStack Router（文件路由）+ TanStack Query（服务端状态）
- Zustand（客户端状态）
- Tailwind CSS + shadcn/ui（New York style）
- i18next + react-i18next（国际化）
- next-themes（主题切换）

### 后端 (packages/server)

- Express 5 + TypeScript
- Drizzle ORM + MySQL
- Redis（缓存、限流、会话）
- Qdrant（向量存储）
- JWT 认证（access/refresh token）
- Pino（结构化日志）

### 共享 (packages/shared)

- 类型定义、常量、Zod 校验 schema、工具函数

### 基础设施

- pnpm monorepo（三个 workspace 包）
- Husky + lint-staged（提交前检查）
- Vitest（测试框架）

## 用户偏好

- **沟通语言**：中文
- **提交规范**：Conventional Commits，提交信息中不包含任何 Claude 相关归属信息
- **包管理器**：pnpm
- **TypeScript**：严格模式，启用 `noUncheckedIndexedAccess`
- **代码风格**：
  - Prettier：单引号、100 字符宽度、2 空格缩进、ES5 尾逗号、LF 换行
  - ESLint：flat config (v9+)
- **Git 工作流**：完成阶段性功能后自动提交并推送，遵循 Conventional Commits
- **路径别名**：
  - 前端：`@/*` → `./src/*`
  - 后端：`@shared/*`、`@modules/*`、`@config/*`
