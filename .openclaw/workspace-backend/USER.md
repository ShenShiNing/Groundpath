# 项目上下文与用户偏好

## 项目信息

- **项目名称**：KnowledgeAgent
- **项目类型**：RAG（检索增强生成）应用
- **核心功能**：文档上传、文本提取、向量嵌入、语义搜索、AI 对话、知识库管理

## 技术栈（后端重点）

### 后端 (packages/server)

- **运行时**：Express 5 + TypeScript（严格模式）
- **ORM**：Drizzle ORM + MySQL
- **缓存**：Redis (ioredis) — 缓存、限流、会话
- **向量存储**：Qdrant
- **认证**：JWT (access/refresh token)，支持 GitHub/Google OAuth
- **日志**：Pino（结构化日志，自动脱敏）
- **开发热重载**：tsx
- **测试框架**：Vitest

### 后端模块 (packages/server/src/modules/)

| 模块             | 职责                                                             |
| ---------------- | ---------------------------------------------------------------- |
| `agent`          | Agent 执行器，工具系统（kb-search、web-search）                  |
| `auth`           | 认证、OAuth、邮箱验证                                            |
| `user`           | 用户资料管理                                                     |
| `document`       | 文档 CRUD、版本、文件夹                                          |
| `document-ai`    | AI 摘要、分析、生成、扩展（SSE 流式）                            |
| `knowledge-base` | 知识库管理                                                       |
| `embedding`      | 嵌入提供商（OpenAI、Zhipu、Ollama）                              |
| `vector`         | Qdrant 向量操作                                                  |
| `rag`            | 文档处理、分块、搜索                                             |
| `llm`            | LLM 提供商（OpenAI、Anthropic、DeepSeek、Zhipu、Ollama、Custom） |
| `chat`           | 对话会话、消息历史、Prompt 组装                                  |
| `storage`        | 文件存储（本地、R2），签名 URL                                   |
| `logs`           | 操作日志、登录日志、系统日志                                     |

### 共享层 (packages/server/src/shared/)

| 模块         | 职责                                     |
| ------------ | ---------------------------------------- |
| `cache`      | Redis 缓存服务（命名空间隔离、TTL）      |
| `config`     | 模块化环境配置                           |
| `db`         | 数据库连接、Schema 定义                  |
| `errors`     | AppError 类和 Errors 工厂                |
| `logger`     | Pino 日志（操作、请求、系统）            |
| `middleware` | 认证、验证、限流、CSRF、净化、安全       |
| `redis`      | Redis 客户端单例                         |
| `scheduler`  | 定时任务（日志清理、令牌清理、向量清理） |
| `utils`      | JWT、分页、Cookie、文件签名、请求辅助    |

### 共享包 (packages/shared)

- 类型定义、常量、Zod 校验 schema、工具函数
- 导入路径：`@knowledge-agent/shared/types`、`/constants`、`/schemas`、`/utils`

## 路径别名

| 别名         | 映射                  |
| ------------ | --------------------- |
| `@shared/*`  | `src/shared/*`        |
| `@modules/*` | `src/modules/*`       |
| `@config/*`  | `src/shared/config/*` |
| `@tests/*`   | `tests/*`             |

## 用户偏好

- **沟通语言**：中文
- **提交规范**：Conventional Commits，提交信息中不包含任何 Claude 相关归属信息
- **包管理器**：pnpm
- **TypeScript**：严格模式，启用 `noUncheckedIndexedAccess`、`verbatimModuleSyntax`
- **代码风格**：
  - Prettier：单引号、100 字符宽度、2 空格缩进、ES5 尾逗号、LF 换行
  - ESLint：flat config (v9+)，`@typescript-eslint/no-explicit-any: warn`，未使用变量允许 `_` 前缀
- **Git 工作流**：完成阶段性功能后自动提交并推送，遵循 Conventional Commits

## 常用命令

```bash
pnpm dev:server       # 运行后端开发服务器
pnpm build            # 构建所有包
pnpm test             # 运行所有测试
pnpm test:server      # 运行服务端测试
pnpm test:shared      # 运行共享包测试
pnpm lint             # ESLint 检查
pnpm format           # Prettier 格式化

# 数据库操作（需在 packages/server 目录下）
pnpm db:generate      # 生成迁移文件
pnpm db:migrate       # 执行迁移
pnpm db:push          # 直接推送 Schema（仅开发）
pnpm db:studio        # 打开 Drizzle Studio
```
