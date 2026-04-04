# 环境变量说明文档

> 生成日期: 2026-04-04
>
> 来源: 仓库根目录 `.env.example` + `packages/server/src/core/config/env/schema.ts`
>
> 注: 本文仅覆盖服务端 schema 校验的运行时变量。根目录 `.env.example` 还包含 Docker Compose / 蓝绿部署使用的编排变量, 例如 `CLIENT_PORT`、`MYSQL_*`、`GHCR_NAMESPACE`。

## 架构概览

环境变量通过四层管理:

1. **`packages/server/src/core/config/env/schema.ts`** — Zod 校验 + 默认值
2. **`packages/server/src/core/config/env/configs.ts`** — 合并 env 与 defaults
3. **`packages/server/src/core/config/defaults/*.defaults.ts`** — 业务常量 (batch size / TTL / 阈值等), 不在 `.env` 中配置
4. **`packages/server/src/core/config/env.ts`** — 对业务代码暴露配置对象的统一入口

---

## 变量状态说明

| 标记       | 含义                                     |
| ---------- | ---------------------------------------- |
| **必填**   | 无默认值, 必须在 `.env` 中显式设置       |
| **可选**   | 有默认值或 `.optional()`, 未设置也能启动 |
| **活跃**   | 在业务代码中有实际引用 (>= 1 个文件)     |
| **可废弃** | 可以考虑移除或合并, 详见"废弃建议"章节   |

---

## 一、Server (服务端)

| 变量                        | 必填 | 默认值                  | 状态 | 说明                                                                                                 |
| --------------------------- | :--: | ----------------------- | :--: | ---------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                  |  否  | `development`           | 活跃 | 运行环境: `development` / `production` / `test`                                                      |
| `PORT`                      |  否  | `3000`                  | 活跃 | HTTP 监听端口                                                                                        |
| `SERVER_TIMEOUT`            |  否  | `30000`                 | 活跃 | 请求超时时间 (ms)                                                                                    |
| `SERVER_KEEP_ALIVE_TIMEOUT` |  否  | `65000`                 | 活跃 | Keep-Alive 超时 (ms), 应大于反向代理超时                                                             |
| `SHUTDOWN_TIMEOUT`          |  否  | `10000`                 | 活跃 | 优雅关闭等待时间 (ms)                                                                                |
| `TRUST_PROXY`               |  否  | —                       | 活跃 | 反向代理信任设置, 影响 IP 检测、速率限制和 Geo-IP. 多层代理部署推荐 `true`; `1` 仅适用于恰好一层代理 |
| `FRONTEND_URL`              |  否  | `http://localhost:5173` | 活跃 | 前端地址, 用于 CORS 和 OAuth 回调                                                                    |

**引用**: `serverConfig` 被 13 个文件引用 — 中间件、路由、OAuth、存储、日志等

**生产提示**:

- 仓库自带的 Docker Compose 部署链路通常是 `OpenResty/1Panel -> client(Nginx) -> server(Node)`，属于多层代理，推荐将 `TRUST_PROXY` 设为 `true`。
- 若登录日志中 IP 固定为 `172.16.0.0/12`、`10.0.0.0/8`、`192.168.0.0/16` 等私网地址，说明上游代理没有把真实来源 IP 正确恢复/透传，Geo-IP 字段会随之全部为空。

---

## 二、Database (数据库)

| 变量                  |  必填  | 默认值 | 状态 | 说明                                                     |
| --------------------- | :----: | ------ | :--: | -------------------------------------------------------- |
| `DATABASE_URL`        | **是** | —      | 活跃 | MySQL 连接字符串. 格式: `mysql://user:pass@host:port/db` |
| `DB_CONNECTION_LIMIT` |   否   | `10`   | 活跃 | 连接池最大连接数                                         |
| `DB_QUEUE_LIMIT`      |   否   | `0`    | 活跃 | 连接池排队上限, `0` 表示无限制                           |

**引用**: `databaseConfig` 被 4 个文件引用 — DB 初始化、脚本

---

## 三、Redis

| 变量                | 必填 | 默认值       | 状态 | 说明                                                                                                                            |
| ------------------- | :--: | ------------ | :--: | ------------------------------------------------------------------------------------------------------------------------------- |
| `REDIS_URL`         | 条件 | `""`         | 活跃 | 当任一 Redis-backed 能力启用时必填: `CACHE_DRIVER=redis`、`QUEUE_DRIVER=bullmq`、`RATE_LIMIT_DRIVER=redis`、`LOCK_DRIVER=redis` |
| `REDIS_PREFIX`      |  否  | `groundpath` | 活跃 | Redis key 前缀, 用于多实例隔离                                                                                                  |
| `CACHE_DRIVER`      |  否  | `redis`      | 活跃 | 缓存驱动: `redis` / `memory`                                                                                                    |
| `RATE_LIMIT_DRIVER` |  否  | `redis`      | 活跃 | 速率限制计数驱动: `redis` / `memory` / `noop`                                                                                   |
| `LOCK_DRIVER`       |  否  | `redis`      | 活跃 | 协调锁驱动: `redis` / `memory`                                                                                                  |

**引用**: `redisConfig` / `cacheConfig` / `rateLimitConfig` / `coordinationConfig` 被缓存、限流、协调锁、队列、启动检查等路径复用

**本地无 Redis 推荐组合**:

- `CACHE_DRIVER=memory`
- `QUEUE_DRIVER=inline`
- `RATE_LIMIT_DRIVER=noop`
- `LOCK_DRIVER=memory`

---

## 四、Authentication (认证)

| 变量                         |  必填  | 默认值                         | 状态 | 说明                                                                        |
| ---------------------------- | :----: | ------------------------------ | :--: | --------------------------------------------------------------------------- |
| `JWT_SECRET`                 | **是** | —                              | 活跃 | JWT HS256 签名密钥, >= 32 字符                                              |
| `JWT_ISSUER`                 |   否   | `groundpath`                   | 活跃 | JWT `iss` 声明                                                              |
| `JWT_AUDIENCE`               |   否   | `groundpath-client`            | 活跃 | JWT `aud` 声明                                                              |
| `ENCRYPTION_KEY`             | **是** | —                              | 活跃 | 通用加密密钥, >= 32 字符. 用于 LLM API Key 加密、刷新令牌哈希、文件签名兜底 |
| `OAUTH_EXCHANGE_CODE_SECRET` |   否   | `""` (降级为 `ENCRYPTION_KEY`) | 活跃 | OAuth 交换码哈希密钥. 未设置时复用 `ENCRYPTION_KEY`                         |
| `AUTH_COOKIE_SAMESITE`       |   否   | `strict`                       | 活跃 | Cookie SameSite 策略: `strict` / `lax` / `none`                             |
| `AUTH_COOKIE_DOMAIN`         |   否   | `""`                           | 活跃 | Cookie Domain. 跨子域场景需设置 (如 `.example.com`)                         |

**引用**: `authConfig` 被 13 个文件引用 — JWT、密码服务、令牌服务、OAuth 等

---

## 五、Email / SMTP (邮件)

| 变量                        |  必填  | 默认值                | 状态 | 说明                                         |
| --------------------------- | :----: | --------------------- | :--: | -------------------------------------------- |
| `SMTP_HOST`                 |   否   | —                     | 活跃 | SMTP 服务器地址                              |
| `SMTP_PORT`                 |   否   | `587`                 | 活跃 | SMTP 端口                                    |
| `SMTP_SECURE`               |   否   | `false`               | 活跃 | 是否使用 TLS 直连 (端口 465 时通常设 `true`) |
| `SMTP_USER`                 |   否   | `""`                  | 活跃 | SMTP 用户名                                  |
| `SMTP_PASS`                 |   否   | `""`                  | 活跃 | SMTP 密码                                    |
| `EMAIL_FROM_NAME`           |   否   | `Groundpath`          | 活跃 | 发件人显示名                                 |
| `EMAIL_FROM_ADDRESS`        |   否   | `noreply@example.com` | 活跃 | 发件人地址                                   |
| `EMAIL_VERIFICATION_SECRET` | **是** | —                     | 活跃 | 邮箱验证码签名密钥, >= 1 字符                |

**引用**: `emailConfig` 被 3 个文件引用 — 邮件发送、邮箱验证

---

## 六、OAuth Providers (第三方登录)

| 变量                   | 必填 | 默认值                               | 状态 | 说明                       |
| ---------------------- | :--: | ------------------------------------ | :--: | -------------------------- |
| `GITHUB_CLIENT_ID`     |  否  | —                                    | 活跃 | GitHub OAuth Client ID     |
| `GITHUB_CLIENT_SECRET` |  否  | —                                    | 活跃 | GitHub OAuth Client Secret |
| `GITHUB_CALLBACK_URL`  |  否  | `.../api/auth/oauth/github/callback` | 活跃 | GitHub 回调地址            |
| `GOOGLE_CLIENT_ID`     |  否  | —                                    | 活跃 | Google OAuth Client ID     |
| `GOOGLE_CLIENT_SECRET` |  否  | —                                    | 活跃 | Google OAuth Client Secret |
| `GOOGLE_CALLBACK_URL`  |  否  | `.../api/auth/oauth/google/callback` | 活跃 | Google 回调地址            |

**引用**: `oauthConfig` 被 2 个文件引用 — GitHub/Google Provider

---

## 七、Storage (文件存储)

| 变量                   | 必填 | 默认值                  | 状态 | 说明                              |
| ---------------------- | :--: | ----------------------- | :--: | --------------------------------- |
| `STORAGE_TYPE`         |  否  | —                       | 活跃 | 存储后端: `local` 或 `r2`         |
| `LOCAL_STORAGE_PATH`   |  否  | `./uploads`             | 活跃 | 本地存储路径 (仅 `local` 模式)    |
| `R2_ACCOUNT_ID`        |  否  | `""`                    | 活跃 | Cloudflare R2 账户 ID             |
| `R2_ACCESS_KEY_ID`     |  否  | `""`                    | 活跃 | R2 Access Key                     |
| `R2_SECRET_ACCESS_KEY` |  否  | `""`                    | 活跃 | R2 Secret Key                     |
| `R2_BUCKET_NAME`       |  否  | `""`                    | 活跃 | R2 Bucket 名称                    |
| `R2_PUBLIC_URL`        |  否  | `""`                    | 活跃 | R2 公开访问 URL                   |
| `FILE_SIGNING_SECRET`  |  否  | 降级为 `ENCRYPTION_KEY` | 活跃 | 文件 URL 签名密钥, >= 32 字符     |
| `DISABLE_FILE_SIGNING` |  否  | `false`                 | 活跃 | 禁用文件签名 (**生产环境不建议**) |

**引用**: `storageConfig` 被 9 个文件引用 — 存储提供商、文件签名、安全中间件

---

## 八、Embedding Providers (向量嵌入)

| 变量                         | 必填 | 默认值                   | 状态 | 说明                                      |
| ---------------------------- | :--: | ------------------------ | :--: | ----------------------------------------- |
| `EMBEDDING_PROVIDER`         |  否  | `zhipu`                  | 活跃 | 嵌入提供商: `zhipu` / `openai` / `ollama` |
| `EMBEDDING_CONCURRENCY`      |  否  | `5`                      | 活跃 | 嵌入请求并发数                            |
| `ZHIPU_API_KEY`              | 条件 | —                        | 活跃 | 智谱 API Key (provider=zhipu 时必填)      |
| `ZHIPU_EMBEDDING_MODEL`      |  否  | `embedding-3`            | 活跃 | 智谱嵌入模型                              |
| `ZHIPU_EMBEDDING_DIMENSIONS` |  否  | `1024`                   | 活跃 | 嵌入向量维度                              |
| `OPENAI_API_KEY`             | 条件 | —                        | 活跃 | OpenAI API Key (provider=openai 时必填)   |
| `OPENAI_EMBEDDING_MODEL`     |  否  | `text-embedding-3-small` | 活跃 | OpenAI 嵌入模型                           |
| `OLLAMA_BASE_URL`            |  否  | `http://localhost:11434` | 活跃 | Ollama 服务地址 (嵌入)                    |
| `OLLAMA_EMBEDDING_MODEL`     |  否  | `nomic-embed-text`       | 活跃 | Ollama 嵌入模型                           |

**引用**: `embeddingConfig` 被 6 个文件引用 — 三个嵌入提供商 + 工厂

---

## 九、Vector Database (向量数据库)

| 变量             | 必填 | 默认值                  | 状态 | 说明                                    |
| ---------------- | :--: | ----------------------- | :--: | --------------------------------------- |
| `QDRANT_URL`     |  否  | `http://localhost:6333` | 活跃 | Qdrant 服务地址                         |
| `QDRANT_API_KEY` |  否  | —                       | 活跃 | Qdrant API Key (云托管或开启认证时需要) |

**引用**: `vectorConfig` 被 3 个文件引用 — Qdrant 客户端、向量仓库、向量清理

---

## 十、LLM Providers (大语言模型)

LLM API Key 和 Base URL 由每个用户在前端 AI 设置页面配置, 加密后存储在数据库中。
服务端仅保留运维参数。

| 变量                  | 必填 | 默认值  | 状态 | 说明                    |
| --------------------- | :--: | ------- | :--: | ----------------------- |
| `MODEL_FETCH_TIMEOUT` |  否  | `15000` | 活跃 | 获取模型列表的超时 (ms) |

**引用**: `llmConfig` 被 1 个文件引用 — model-fetcher (超时)

---

## 十一、Agent / Web Search (智能体)

| 变量             | 必填 | 默认值 | 状态 | 说明                                        |
| ---------------- | :--: | ------ | :--: | ------------------------------------------- |
| `TAVILY_API_KEY` |  否  | —      | 活跃 | Tavily 搜索 API Key, Agent 联网搜索功能所需 |

**引用**: `agentConfig` 被 11 个文件引用 — Agent 执行器、工具链、聊天流

---

## 十二、VLM (视觉语言模型)

| 变量           | 必填 | 默认值        | 状态 | 说明                                                   |
| -------------- | :--: | ------------- | :--: | ------------------------------------------------------ |
| `VLM_PROVIDER` |  否  | `openai`      | 活跃 | VLM 提供商: `openai` / `anthropic`                     |
| `VLM_MODEL`    |  否  | `gpt-4o-mini` | 活跃 | 视觉模型名称                                           |
| `VLM_API_KEY`  | 条件 | —             | 活跃 | VLM 专用 Key (`IMAGE_DESCRIPTION_ENABLED=true` 时必填) |
| `VLM_BASE_URL` |  否  | —             | 活跃 | 自定义 Base URL                                        |

**引用**: `vlmConfig` 被 5 个文件引用 — VLM 工厂、服务、结构化 RAG 处理

> 需要同时开启 `IMAGE_DESCRIPTION_ENABLED=true` 才会实际调用

---

## 十三、Queue / Worker (队列)

| 变量                | 必填 | 默认值   | 状态 | 说明                                  |
| ------------------- | :--: | -------- | :--: | ------------------------------------- |
| `QUEUE_DRIVER`      |  否  | `bullmq` | 活跃 | 文档处理队列驱动: `bullmq` / `inline` |
| `QUEUE_CONCURRENCY` |  否  | `3`      | 活跃 | 文档处理队列最大并发数 (1-20)         |

**引用**: `queueConfig` 被队列 driver 组合根和文档处理队列复用

---

## 十四、Logging (日志)

| 变量        | 必填 | 默认值 | 状态 | 说明                                                                         |
| ----------- | :--: | ------ | :--: | ---------------------------------------------------------------------------- |
| `LOG_LEVEL` |  否  | `info` | 活跃 | 日志级别: `fatal` / `error` / `warn` / `info` / `debug` / `trace` / `silent` |

**引用**: `loggingConfig` 被 4 个文件引用 — 日志初始化、清理服务、调度器

---

## 十五、Structured RAG Observability (结构化 RAG 可观测性)

| 变量                                 | 必填 | 默认值      | 状态 | 说明                        |
| ------------------------------------ | :--: | ----------- | :--: | --------------------------- |
| `STRUCTURED_RAG_ALERTS_ENABLED`      |  否  | `false`     | 活跃 | 启用结构化 RAG 告警         |
| `STRUCTURED_RAG_ALERT_EMAIL_TO`      |  否  | `""`        | 活跃 | 告警邮件接收地址 (逗号分隔) |
| `STRUCTURED_RAG_ALERT_SCHEDULE_CRON` |  否  | `0 5 * * *` | 活跃 | 告警检查 cron 表达式 (UTC)  |

**引用**: `structuredRagObservabilityConfig` 被 4 个文件引用 — 仪表板、告警、报告服务

---

## 十六、Schedules / Cron (定时任务)

| 变量                                    | 必填 | 默认值         | 状态 | 说明                     |
| --------------------------------------- | :--: | -------------- | :--: | ------------------------ |
| `DOCUMENT_PROCESSING_RECOVERY_CRON`     |  否  | `*/10 * * * *` | 活跃 | 文档处理卡死恢复检查频率 |
| `DOCUMENT_BUILD_CLEANUP_CRON`           |  否  | `30 3 * * *`   | 活跃 | 废弃/失败构建清理时间    |
| `DOCUMENT_BUILD_CLEANUP_RETENTION_DAYS` |  否  | `7`            | 活跃 | 构建产物保留天数         |
| `DOCUMENT_BUILD_CLEANUP_BATCH_SIZE`     |  否  | `100`          | 活跃 | 每次清理最大构建数       |
| `BACKFILL_SCHEDULE_CRON`                |  否  | `0 2 * * *`    | 活跃 | 索引回填定时任务         |

**引用**: `documentConfig` 被 14 个文件引用; `backfillScheduleConfig` 被 1 个文件引用

---

## 十七、Feature Flags (功能开关)

| 变量                                           | 必填 | 默认值     | 状态 | 说明                                      |
| ---------------------------------------------- | :--: | ---------- | :--: | ----------------------------------------- |
| `DISABLE_RATE_LIMIT`                           |  否  | `false`    | 活跃 | 禁用速率限制 (仅开发环境)                 |
| `COUNTER_SYNC_ENABLED`                         |  否  | `false`    | 活跃 | 启用定期计数器同步                        |
| `STRUCTURED_RAG_ENABLED`                       |  否  | `false`    | 活跃 | 结构化 RAG 总开关                         |
| `STRUCTURED_RAG_ROLLOUT_MODE`                  |  否  | `disabled` | 活跃 | 灰度模式: `disabled` / `internal` / `all` |
| `STRUCTURED_RAG_INTERNAL_USER_IDS`             |  否  | `""`       | 活跃 | 内部测试用户 ID 白名单 (逗号分隔)         |
| `STRUCTURED_RAG_INTERNAL_KB_IDS`               |  否  | `""`       | 活跃 | 内部测试知识库 ID 白名单 (逗号分隔)       |
| `IMAGE_DESCRIPTION_ENABLED`                    |  否  | `false`    | 活跃 | 启用 VLM 图像描述 (需配置 VLM 提供商)     |
| `DOCUMENT_PROCESSING_RECOVERY_ENABLED`         |  否  | `true`     | 活跃 | 启用卡死文档自动恢复                      |
| `DOCUMENT_PROCESSING_RECOVERY_REQUEUE_ENABLED` |  否  | `true`     | 活跃 | 恢复后自动重新入队                        |
| `DOCUMENT_BUILD_CLEANUP_ENABLED`               |  否  | `true`     | 活跃 | 启用构建产物清理                          |
| `LOG_CLEANUP_ENABLED`                          |  否  | `true`     | 活跃 | 启用日志保留期清理                        |
| `BACKFILL_SCHEDULE_ENABLED`                    |  否  | `false`    | 活跃 | 启用定时回填任务                          |

**引用**: `featureFlags` 被 10 个文件引用 — RAG 路由、速率限制、PDF 解析、图像描述

---

## 优化建议

### 已完成的清理

以下 6 个 LLM Provider 环境变量已移除, 因为 LLM API Key 由用户在前端页面配置并存入数据库:

- ~~`OPENAI_LLM_API_KEY`~~ — 原为 OpenAI LLM fallback key
- ~~`ZHIPU_LLM_API_KEY`~~ — 原为智谱 LLM fallback key
- ~~`ANTHROPIC_API_KEY`~~ — 原为 Anthropic fallback key
- ~~`DEEPSEEK_API_KEY`~~ — 原为 DeepSeek fallback key
- ~~`DEEPSEEK_BASE_URL`~~ — 原为 DeepSeek Base URL (model-fetcher 已硬编码)
- ~~`OLLAMA_LLM_BASE_URL`~~ — 原为 Ollama LLM fallback base URL (用户前端可配置, 工厂内硬编码默认值)
- VLM 不再隐式降级到 LLM Key, 需显式设置 `VLM_API_KEY`

### 低引用 / 可合并项

| 变量                                                   | 引用数  | 建议                 | 原因                                                      |
| ------------------------------------------------------ | :-----: | -------------------- | --------------------------------------------------------- |
| `FILE_SIGNING_SECRET`                                  |  1 处   | 保留但可标注为"高级" | 已有降级逻辑 (`ENCRYPTION_KEY`), 大多数部署不需要单独设置 |
| `OAUTH_EXCHANGE_CODE_SECRET`                           |  1 处   | 同上                 | 已有降级逻辑 (`ENCRYPTION_KEY`)                           |
| `BACKFILL_SCHEDULE_ENABLED` + `BACKFILL_SCHEDULE_CRON` | 各 1 处 | 正常保留             | 功能完整, 仅使用频率低                                    |
| `COUNTER_SYNC_ENABLED`                                 |  1 处   | 正常保留             | 在调度器中使用, 默认关闭合理                              |
