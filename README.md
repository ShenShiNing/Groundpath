# Knowledge Agent

English version: [README.en.md](./README.en.md)

最后更新：2026-03-14

Knowledge Agent 是一个面向个人/团队知识管理场景的 RAG（Retrieval-Augmented Generation）应用。它支持从文档入库、分块向量化、语义检索到多轮对话与引用回溯的完整闭环，并提供文档 AI（摘要/分析/生成）能力。

仓库采用 `pnpm` monorepo：

- `packages/client`：React + Vite 前端
- `packages/server`：Express + TypeScript 后端
- `packages/shared`：前后端共享类型、常量、Zod 契约与工具

## 1. 功能详解

### 1.1 账号与安全

- 邮箱密码注册/登录、刷新 token、登出、全设备登出
- 邮箱验证码（发送/校验）与验证码注册、密码重置
- OAuth 登录（GitHub、Google）
- 会话管理：查看当前账号所有活跃会话、按设备撤销
- 安全机制：
  - Access Token + Refresh Token
  - Refresh Token Rotation（刷新时轮换）
  - CSRF 防护（双重提交 token）
  - Redis 限流（登录/注册/刷新/验证码等）
  - Helmet 安全头、请求清洗、统一错误码返回

### 1.2 知识库与文档管理

- 知识库 CRUD，按知识库隔离检索范围
- 知识库维度嵌入配置（provider/model/dimensions），创建后保持稳定
- 文档能力：
  - 上传：`pdf / docx / md / txt`
  - 元信息编辑（标题/描述/目录）
  - 内容编辑（Markdown/TXT）
  - 下载与预览
  - 版本历史、上传新版本、恢复到历史版本
  - 回收站、恢复、永久删除
- 目录树（Folder）管理，支持知识库内层级组织

### 1.3 RAG 检索与对话

- 文档异步处理流水线：分块 -> 向量化 -> 写入 Qdrant
- 支持结构化文档索引（Document Index）：提取大纲、节点内容、引用关系，供 Structured RAG 使用
- 检索过滤：按 `userId / knowledgeBaseId / documentIds / scoreThreshold` 过滤
- **Agentic RAG**：当 LLM 支持 tool calling 时，自动进入 Agent 模式
  - LLM 自主决定调用工具的时机与次数
  - 传统工具：知识库检索（`kb_search`）
  - Structured RAG rollout 启用后可使用结构化工具：`outline_search`、`node_read`、`ref_follow`、`vector_fallback_search`
  - 网络搜索工具：`web_search`（基于 Tavily）
  - 实时展示工具调用过程（tool steps），支持展开查看结果
  - 不支持 tool calling 的模型自动回退到传统流式 RAG
- 多轮对话：
  - 会话创建、列表、搜索、重命名、删除
  - 消息流式返回（SSE），支持中断生成
  - 引用来源（sources）回传与文档跳转
  - 可限定”文档范围”提问
  - 消息重试

### 1.4 Document AI

- 文档摘要：同步 + SSE 流式
- 长文分层摘要（自动分块后汇总）
- 文档分析：关键词、实体、主题、结构化信息
- 文档生成：按 prompt/template/style 生成
- 文档扩写：基于已有文档内容进行 before/after/replace 扩展
- 可选 VLM 图像描述：为 PDF 中提取的图片生成描述，增强结构化检索与回答上下文

### 1.5 模型与存储扩展

- LLM Provider：`openai / anthropic / zhipu / deepseek / ollama / custom`
- Embedding Provider：`zhipu / openai / ollama`
- Web Search：Tavily API（为 Agent 模式提供网络搜索能力）
- 存储后端：`local` 或 `Cloudflare R2`
- 文件访问支持签名 URL（开发环境可关闭签名便于调试）

### 1.6 国际化

- 前端基于 i18next + react-i18next，支持浏览器语言检测与多语言切换
- 命名空间化翻译（按模块划分）

### 1.7 日志与运维能力

- 登录日志、操作日志、系统日志
- OpenAPI / Swagger 文档：`/api-docs`
- 定时任务（UTC）：
  - 日志清理
  - 刷新 token 清理
  - 向量软删除清理
  - 可选计数器同步
  - 可选结构化 RAG 告警检查
  - 可选文档索引回填（document-index backfill）
  - 卡住的文档处理任务恢复
  - 不可变文档构建产物清理
- 服务优雅停机（关闭 HTTP、MySQL、Redis 连接）

## 2. 部署流程（详细）

仓库现已内置 Docker 编排与 GitHub Actions，可直接用 `docker compose` 启动标准化环境；如果你不使用容器，也可以继续按下面的手工方式部署。

### 2.1 Docker Compose 快速启动

最短路径：

```bash
pnpm docker:up
```

启动后默认地址：

- 前端：`http://localhost:8080`
- 后端 API：`http://localhost:3000`
- Swagger：`http://localhost:8080/api-docs`
- 健康检查：`http://localhost:8080/health/live`、`http://localhost:8080/health/ready`

Compose 默认会拉起：

- `client`：Nginx 托管前端并反代 `/api`、`/api-docs`、`/health*`
- `server`：Express API 服务
- `mysql`、`redis`、`qdrant`：后端依赖

如需覆盖默认密码、端口或 JWT 密钥，可在启动前通过 shell 环境变量覆盖，例如：

```bash
# Linux/macOS
JWT_SECRET=replace-with-32-char-secret ENCRYPTION_KEY=replace-with-32-char-secret pnpm docker:up

# Windows PowerShell
$env:JWT_SECRET='replace-with-32-char-secret'
$env:ENCRYPTION_KEY='replace-with-32-char-secret'
pnpm docker:up
```

停止并清理容器：

```bash
pnpm docker:down
pnpm docker:down:volumes
```

### 2.2 环境准备

必须依赖：

- Node.js >= 18
- pnpm >= 9
- MySQL 8+
- Redis 6+
- Qdrant（本地或云）

可选依赖：

- Ollama（本地模型）
- SMTP 服务（邮箱验证码/重置密码）
- Cloudflare R2（生产文件存储）

### 2.3 拉取与安装

```bash
pnpm install
```

### 2.4 配置环境变量

后端会从 `packages/server` 目录读取：

- `.env.{NODE_ENV}.local`
- `.env.{NODE_ENV}`
- `.env`

创建配置文件：

```bash
# Linux/macOS
cp packages/server/.env.example packages/server/.env

# Windows PowerShell
Copy-Item packages/server/.env.example packages/server/.env
```

最低可启动配置（必须设置）：

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`（至少 32 字符）
- `ENCRYPTION_KEY`（至少 32 字符）
- `EMAIL_VERIFICATION_SECRET`

常用关键项：

- `FRONTEND_URL`（CORS 与签名 URL 域名基准）
- `QDRANT_URL`
- `STORAGE_TYPE=local|r2`
- `EMBEDDING_PROVIDER=zhipu|openai|ollama`
- `ZHIPU_API_KEY` / `OPENAI_API_KEY`（对应 provider 时需要）
- `TAVILY_API_KEY`（启用 Agent 网络搜索功能时需要）
- `STRUCTURED_RAG_ENABLED` / `STRUCTURED_RAG_ROLLOUT_MODE`（启用结构化 RAG 路由与灰度）
- `IMAGE_DESCRIPTION_ENABLED`、`VLM_PROVIDER`、`VLM_MODEL`、`VLM_API_KEY`（启用图片描述时需要）
- `DOCUMENT_PROCESSING_RECOVERY_*`、`DOCUMENT_BUILD_CLEANUP_*`、`BACKFILL_SCHEDULE_*`（处理恢复、构建清理、索引回填计划任务）

### 2.5 初始化数据库

开发环境快速同步 schema：

```bash
pnpm -F @knowledge-agent/server db:push
```

生产环境建议使用迁移：

```bash
pnpm -F @knowledge-agent/server db:migrate
```

提交或发布前可先做结构校验：

```bash
pnpm -F @knowledge-agent/server db:drift-check
pnpm -F @knowledge-agent/server db:verify
```

### 2.6 启动开发环境

```bash
pnpm dev
```

默认端口：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3000`

说明：开发模式下 Vite 已代理 `/api` 到 `http://localhost:3000`。

### 2.7 构建与生产启动

1. 构建所有包：

```bash
pnpm build
```

2. 启动后端：

```bash
pnpm -F @knowledge-agent/server start
```

3. 发布前端静态资源：

- 构建产物目录：`packages/client/dist`
- 使用 Nginx/Caddy/静态托管服务提供该目录

### 2.8 生产反向代理建议（Nginx 示例）

前端使用相对路径访问 `/api`，推荐同域部署：

```nginx
server {
  listen 80;
  server_name your-domain.com;

  root /var/www/knowledge-agent/client-dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # SSE 需要关闭代理缓冲
    proxy_buffering off;
  }

  location /api-docs {
    proxy_pass http://127.0.0.1:3000;
  }

  location /api-docs/ {
    proxy_pass http://127.0.0.1:3000;
  }

  location /health {
    proxy_pass http://127.0.0.1:3000;
  }

  location /health/ {
    proxy_pass http://127.0.0.1:3000;
  }
}
```

如果部署在反向代理后，请设置 `TRUST_PROXY`（例如 `1` 或 `true`），保证限流与审计 IP 正确。

### 2.9 部署后验证清单

- `GET /health/live` 可返回 `200`
- `GET /health/ready` 在依赖就绪后返回 `200`
- `GET /api/hello` 仍可返回成功（兼容旧探针）
- `GET /api-docs` 可正常打开 Swagger UI
- 登录后能创建知识库
- 上传文档后 `processingStatus` 最终变为 `completed`
- 对话页面可以收到 SSE 流式响应
- Agent 模式下工具调用步骤（tool steps）正常显示
- 回收站恢复/永久删除流程正常
- 定时清理任务日志正常输出

## 3. 工作原理

### 3.1 核心组件职责

- MySQL（Drizzle）：
  - 用户、会话、知识库、文档、版本、分块、聊天、日志等结构化数据
- Redis：
  - 限流计数、缓存与会话相关辅助能力
- Qdrant：
  - 文档分块向量存储与相似度搜索
- Storage（Local/R2）：
  - 原始文件与版本文件存储
- LLM/Embedding Provider：
  - 文本生成、摘要分析、向量嵌入
- Tavily API：
  - Agent 模式下的网络搜索能力

### 3.2 核心链路 A：文档入库到可检索

1. 用户上传文档（`/api/documents` 或 `/api/knowledge-bases/:id/documents`）。
2. 后端完成类型校验、存储写入、`document + document_version` 事务落库。
3. 文档状态置为 `pending`，异步触发 RAG 处理。
4. RAG 服务读取当前版本文本，执行分块、向量化，并按需构建结构化 Document Index（大纲/节点/引用边）。
5. 采用“先写新向量，再删旧向量”策略，降低处理窗口内检索中断风险。
6. 同步更新 chunk 与知识库计数器，最终状态变更为 `completed`。

### 3.3 核心链路 B：检索增强对话（SSE）

1. 客户端发送消息到 `/api/chat/conversations/:id/messages`。
2. 服务端根据 LLM 能力选择模式：
   - **Agent 模式**（LLM 支持 tool calling）：LLM 自主编排工具调用，按需执行传统检索、结构化节点检索或网络搜索
   - **传统模式**（fallback）：先执行硬编码 RAG 检索，再流式调用 LLM
3. SSE 事件流：
   - `tool_start`：工具调用开始（Agent 模式）
   - `tool_end`：工具调用结束，含结果和耗时（Agent 模式）
   - `sources`：引用来源
   - `chunk`：增量文本
   - `done`：结束事件
   - `error`：错误事件
4. 完成后写入 assistant 消息，保存 citations 和 agentTrace 元数据。

### 3.4 核心链路 C：文档 AI

- 摘要：短文直出，长文采用分层摘要（chunk summary -> merge summary）
- 分析：关键词/实体/主题使用 LLM，结构分析走本地计算
- 生成/扩写：支持结合知识库检索上下文增强生成效果

### 3.5 一致性与容错设计

- 文档写入关键步骤使用 MySQL 事务
- 存储已上传但事务失败时执行补偿删除
- 向量物理删除失败时降级为软删除并由定时任务清理
- 处理过程使用“内存锁 + 数据库状态”避免并发重复处理

## 4. 常用命令

| 命令                                                      | 说明                             |
| --------------------------------------------------------- | -------------------------------- |
| `pnpm dev`                                                | 同时启动前后端开发服务           |
| `pnpm dev:client`                                         | 仅启动前端                       |
| `pnpm dev:server`                                         | 仅启动后端                       |
| `pnpm docker:up`                                          | 使用 Docker Compose 启动整套环境 |
| `pnpm docker:down`                                        | 停止 Docker Compose 环境         |
| `pnpm docker:down:volumes`                                | 停止并清理 Docker 数据卷         |
| `pnpm build`                                              | 构建全部包                       |
| `pnpm lint`                                               | ESLint 检查                      |
| `pnpm lint:fix`                                           | ESLint 自动修复                  |
| `pnpm format`                                             | Prettier 格式化                  |
| `pnpm test`                                               | 运行测试                         |
| `pnpm test:coverage`                                      | 测试覆盖率                       |
| `pnpm test:server`                                        | 仅运行后端测试                   |
| `pnpm test:shared`                                        | 仅运行共享包测试                 |
| `pnpm -F @knowledge-agent/server db:push`                 | 开发环境同步数据库结构           |
| `pnpm -F @knowledge-agent/server db:drift-check`          | 检查 schema/migration 漂移       |
| `pnpm -F @knowledge-agent/server db:check`                | 执行数据库一致性检查             |
| `pnpm -F @knowledge-agent/server db:migrate`              | 执行迁移                         |
| `pnpm -F @knowledge-agent/server db:verify`               | 依次执行漂移检查与 DB 一致性校验 |
| `pnpm -F @knowledge-agent/server db:studio`               | 打开 Drizzle Studio GUI          |
| `pnpm -F @knowledge-agent/server db:sync-counters`        | 手动同步知识库计数器             |
| `pnpm -F @knowledge-agent/server document-index:backfill` | 手动触发文档索引回填             |
| `pnpm -F @knowledge-agent/client preview`                 | 本地预览前端构建产物             |
| `pnpm architecture:check`                                 | 检查服务端依赖架构约束           |

## 4.1 架构门禁

- Pull Request 和分支推送会自动执行 `pnpm lint`、`pnpm test`、`pnpm build`、`pnpm architecture:check`，并验证前后端 Docker 镜像可构建。
- 推送到 `main` 或手动触发时，CD workflow 会把 `server` / `client` 镜像发布到 GitHub Container Registry（GHCR）。
- 新增后端跨模块复用时，默认通过拥有方模块的 `public/*` 出口暴露，不直接新增 deep import。
- 具体守则见 [docs/architecture-guardrails.md](./docs/architecture-guardrails.md)。

## 5. 开源协议

本项目采用 **MIT License**。

- 你可以在保留版权与许可声明的前提下自由使用、修改、分发。
- 项目按“现状”提供，不对特定用途适配性与潜在风险提供担保。

如用于生产环境，请自行评估并承担由配置、数据安全与第三方服务产生的风险。
