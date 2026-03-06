# Repository Guidelines

## 沟通与项目结构

- 与协作者沟通默认使用中文。
- 仓库为 `pnpm` monorepo：`packages/client`（React 19 + Vite + TanStack Router/Query + Tailwind v4）、`packages/server`（Express 5 + TypeScript）、`packages/shared`（类型/常量/schema/工具）。
- 后端采用垂直模块：`packages/server/src/modules/*`；基础设施在 `packages/server/src/shared/*`；脚本在 `packages/server/src/scripts/*`；SQL 迁移在 `packages/server/drizzle`。
- 当前后端核心模块包括：`auth`、`user`、`knowledge-base`、`document`、`document-ai`、`chat`、`rag`、`llm`、`embedding`、`vector`、`storage`、`logs`、`agent`。
- 测试目录在 `packages/server/tests`、`packages/client/tests`、`packages/shared/tests`。

## 构建、测试与开发命令

- `pnpm dev`：同时启动前后端。
- `pnpm dev:client` / `pnpm dev:server`：单独启动客户端或服务端。
- `pnpm build`：构建全部包。
- `pnpm lint` / `pnpm lint:fix`：检查/修复 ESLint。
- `pnpm format` / `pnpm format:check`：格式化或校验 Prettier。
- `pnpm test` / `pnpm test:watch` / `pnpm test:coverage` / `pnpm test:ui`：运行 Vitest（workspace projects）。
- `pnpm test:server` / `pnpm test:shared`：仅运行对应包测试；客户端可用 `pnpm -F @knowledge-agent/client test`。
- `pnpm -F @knowledge-agent/server db:generate|db:migrate|db:push|db:studio`：Drizzle 迁移与推送。
- `pnpm -F @knowledge-agent/server db:sync-counters|db:check`：计数器同步与一致性检查脚本。
- 提交前会触发 `pnpm lint-staged`（由 Husky pre-commit 执行）。

## 代码风格与命名规范

- TypeScript 严格模式；Prettier：2 空格、单引号、分号、`printWidth: 100`；服务端开启 `noUnusedLocals/noUnusedParameters`。
- 服务端按 `controllers -> services -> repositories` 分层，优先经模块 `index.ts`（barrel）导入，避免跨层深路径引用。
- 优先使用路径别名：服务端 `@shared/*`、`@modules/*`、`@config/*`、`@tests/*`；客户端 `@/*`。
- 共享契约统一来自 `@knowledge-agent/shared/*`，避免重复定义常量/错误码。
- 命名示例：`auth.service.ts`、`knowledge-base.controller.ts`、`settings.ai.route.tsx`、`knowledge-bases.$id.route.tsx`、`SessionCard.tsx`。

## 测试与质量红线

- 测试文件命名：`*.test.ts(x)` / `*.spec.ts(x)`；端到端测试使用 `*.e2e.test.ts`；故障注入测试使用 `*.error-injection.test.ts`。
- 修改核心流程（如上传/删除/恢复、版本切换、计数器、向量、存储签名 URL、SSE 对话、Document AI）必须补测试，至少覆盖一次幂等与失败回滚/补偿场景。
- 外部调用（Qdrant/LLM/Embedding/存储/Redis/OAuth/邮件）必须有 `timeout`、重试与错误分类；可配置项放在 `config/*` 与 `.env.example`。
- 输入先经 Zod/中间件校验；统一使用 `AppError/Errors` 返回错误；日志记录关键 ID（如 `userId/documentId/kbId`），禁止记录 token/密钥/PII。

## 配置与环境

- 环境变量模板在 `packages/server/.env.example`。
- Drizzle 配置会按顺序加载 `.env.{NODE_ENV}.local` -> `.env.{NODE_ENV}` -> `.env`，并要求 `DATABASE_URL` 必填。
- 新增配置项时同步更新 `packages/server/src/shared/config/*` 与 `.env.example`，避免隐式默认值漂移。

## 提交与 PR 要求

- 使用 Conventional Commits：`feat(scope): ...`、`fix(scope): ...`、`refactor(scope): ...`。
- scope 应对应包或领域（如 `client`、`server`、`auth`、`chat`）。
- PR 至少包含：变更摘要、影响范围、执行过的命令（lint/test/build）、配置或迁移说明；UI 变更附截图。
