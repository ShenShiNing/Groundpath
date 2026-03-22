# 代码质量、架构、数据库与 API 评审

最后更新：2026-03-23

## 1. 评审范围

- 以后端 `packages/server` 为主，重点检查文档/知识库/RAG/索引链路。
- 抽查前端 `packages/client` 的 API 消费方式，核对客户端与服务端契约是否一致。
- 结合现有测试、OpenAPI、Drizzle schema、仓库文档与自动化门禁输出进行判断。

## 2. 总体结论

仓库整体工程化基础是好的：

- 后端模块边界清晰，`public/*` 出口策略已经落地。
- 文档索引生命周期设计有明确的 immutable build、publish fencing、清理任务和缓存失效机制。
- 数据库 schema 在文档索引相关表上具备比较完整的外键和级联删除设计。
- 计数器更新已经普遍使用 `GREATEST(..., 0)` 做 floor 保护。

但当前仍有 3 个需要优先处理的结构性问题：

1. 知识库删除没有真正编排子资源删除，导致“知识库已删、文档仍活着”的逻辑不一致。
2. 文档删除 / 恢复 / 版本新增缺少实体级互斥或条件更新，存在并发下计数器漂移和版本冲突风险。
3. OpenAPI 与真实响应/查询契约已经出现漂移，而现有测试没有兜住这类漂移。

## 3. 高优先级发现

### P1. 知识库删除只软删 knowledge base，没有编排文档、索引和向量的配套删除

**现象**

- `packages/server/src/modules/knowledge-base/services/knowledge-base.service.ts:183-191` 的注释已经写明“文档和向量级联删除由调用方处理”，但实现里只做了 `knowledgeBaseRepository.softDelete(...)`。
- `packages/server/src/modules/knowledge-base/controllers/knowledge-base.controller.ts:100-104` 直接调用这个 service，没有额外 orchestration。
- `packages/server/src/modules/document/repositories/document.repository.core.ts:61-80` 在列文档时只按 `documents.deletedAt` 过滤，不会联查 `knowledge_bases.deletedAt`。

**影响**

- API 语义上“删除知识库”并不等于“删除知识库及其内容”，而是留下仍可访问的活跃文档。
- 文档、chunks、index versions、vectors 与 knowledge base 的生命周期脱钩，后续恢复、统计、检索和清理都会变得不稳定。
- 这与仓库在 `AGENTS.md` 中强调的“多步流程必须在单一 service 中编排，副作用保持配对”是冲突的。

**建议**

- 为知识库删除新增单一编排 service，至少完成以下动作：
  - 锁定 knowledge base 实体。
  - 软删或归档所属文档。
  - 清理/失效对应索引、chunks、vectors。
  - 原子更新计数器或直接重算。
- 如果暂时不做级联删除，API 层至少应拒绝删除非空知识库，而不是返回成功。
- 增加集成测试覆盖“删除知识库后文档列表 / 文档详情 / RAG 查询”的期望行为。

### P1. 文档删除、恢复、版本新增缺少实体锁或条件更新，并发下会破坏幂等性

**现象**

- `packages/server/src/modules/document/services/document.service.ts:162-193` 先在事务外读取 document，再在事务内执行 `softDelete + chunkCount 清零 + 计数器递减`，没有 `FOR UPDATE` 或条件更新。
- `packages/server/src/modules/document/services/document-trash.service.ts:107-126` 的恢复流程同样先查后写，没有实体互斥。
- `packages/server/src/modules/document/services/document-version.service.ts:62-110` 在事务外读取 `currentVersion`，再用 `document.currentVersion + 1` 生成新版本号。
- `packages/server/src/core/db/schema/document/document-versions.schema.ts:42-50` 虽然有 `(document_id, version)` 唯一索引，但这只是最后一道数据库冲突兜底，不等于业务层串行化。

**影响**

- 两次并发删除可能同时通过前置校验，导致 `documentCount` / `totalChunks` 被重复扣减。
- 两次并发恢复可能重复递增计数器。
- 两次并发上传新版本会竞争同一个 `newVersion`，其中一个请求最终以数据库唯一键异常失败，暴露为 500/冲突错误，而不是稳定的业务语义。

**建议**

- 对删除、恢复、版本新增、版本恢复这类一致性敏感流程统一引入实体级互斥：
  - 文档行级锁 `SELECT ... FOR UPDATE`。
  - 或基于状态字段的条件更新 + `affectedRows` 判定。
- 对 delete/restore 增加显式幂等语义：
  - 已删除再次删除应返回稳定结果而不是再次递减计数。
  - 已恢复再次恢复应返回稳定结果而不是再次递增计数。
- 增加集成测试覆盖：
  - 重复 delete / restore。
  - 并发 uploadNewVersion / restoreVersion。
  - 失败回滚后计数器与版本号保持一致。

### P2. OpenAPI 契约已经和真实 API 漂移

**现象**

- `packages/server/src/core/openapi/paths/knowledge-base.paths.ts:49-74`
  - `POST /api/knowledge-bases/{id}/documents` 的 201 响应被定义为 `{ id, title }`。
  - `GET /api/knowledge-bases/{id}/documents` 没有声明 query schema。
- 但真实服务端在 `packages/server/src/modules/knowledge-base/controllers/knowledge-base.controller.ts:124-138` 返回的是 `{ document, message }`。
- 前端客户端 `packages/client/src/api/knowledge-bases.ts:84-100` 也明确按 `{ document: DocumentInfo; message: string }` 消费。
- 路由 `packages/server/src/modules/knowledge-base/knowledge-base.routes.ts:105-109` 还实际使用了 `validateQuery(documentListParamsSchema)`。

**影响**

- Swagger 文档、后续 SDK 生成和人工联调都会得到错误契约。
- 当前 OpenAPI 自动发现只校验“有没有路由”，并没有系统性校验“响应体和请求参数是否与真实 DTO 对齐”。

**建议**

- `knowledge-base.paths.ts` 直接复用 shared schema，避免手写简化版响应。
- 给 `GET /api/knowledge-bases/{id}/documents` 补上 query schema。
- 扩展 `packages/server/tests/shared/openapi/openapi.routes.test.ts`，把知识库文档上传/列表接口也纳入断言。

## 4. 中优先级发现

### P2. “E2E smoke” 测试过度 mock service 层，无法真实保护 API 契约

**现象**

- `packages/server/tests/e2e/smoke-kb-document.e2e.test.ts:35-69` 直接 mock 了 `knowledgeBaseService` 和 `documentService`。
- 这些 mock 返回的结构本身就与真实 service 不一致，例如 `knowledgeBaseService.create()` 被 mock 成 `{ knowledgeBase: ... }`，`list()` 被 mock 成 `{ items: ... }`，而真实实现返回的是 `KnowledgeBaseInfo` / `KnowledgeBaseListResponse`。
- 测试中也按这个 mock 结构取值，例如 `packages/server/tests/e2e/smoke-kb-document.e2e.test.ts:162-166` 读取 `body.data.knowledgeBase`。

**影响**

- 这类测试更像“路由接线冒烟”而不是端到端契约测试。
- 它解释了为什么真实 API、OpenAPI、前端客户端三者已经漂移，但 smoke 测试仍然是绿的。

**建议**

- 这类测试要么改名为 route smoke test，要么升级为真正的 HTTP contract test。
- 如果继续保留 mock，至少要强制 mock 返回值与真实 shared DTO 对齐。

### P3. README 链接了不存在的代码分析文档

**现象**

- `README.md:25-31` 和 `README.en.md:25-31` 都链接到了不存在的 `docs/codebase-analysis-2026-03-22.md`。

**影响**

- 新协作者会直接点击到 404/不存在文件，说明文档发布流程没有闭环。

**建议**

- 保持 README 链接与实际文档文件名同步。
- 如果文档按日期输出，建议保留一个稳定入口，例如 `docs/codebase-analysis.md`，日期版作为归档。

**后续处理进展（2026-03-23）**

- 已新增稳定入口 `docs/codebase-analysis.md`。
- `README.md` 与 `README.en.md` 已改为链接稳定入口，日期版文档保留为归档。

## 5. 正向观察

### 架构

- `pnpm architecture:check` 通过，说明后端模块边界当前是受控的。
- `document-index` 模块的 `public/*` 能力出口拆分粒度合理，没有重新长成 mega barrel。
- 文档索引发布链路把“构建”“激活”“缓存失效”“过期构建清理”拆成独立 service，职责边界比较清晰。

### 数据库设计

- `document_index_versions`、`document_chunks`、`document_nodes`、`document_node_contents`、`document_edges` 之间的外键与 `onDelete('cascade')` 设计完整，immutable build 清理逻辑是自洽的。
- `knowledge_base` 计数器更新使用了 `GREATEST(..., 0)`，满足 floor 保护要求。
- 文档索引表上已有较完整的索引，支持按 `documentId`、`indexVersionId`、`builtAt`、`status` 的常见查询路径。

### 代码质量

- 生产代码主体文件规模控制尚可，主要超长文件集中在测试。
- 错误处理、日志、OpenAPI、配置分层基本形成统一模式。

## 6. 测试与自动化信号

### 已执行

- `pnpm architecture:check`
  - 结果：通过，无 dependency violation。
- `pnpm lint`
  - 结果：无 error，只有 2 个 warning。
  - 位置：`packages/server/tests/shared/openapi/openapi.routes.test.ts:13`、`:17`
  - 原因：`@typescript-eslint/no-explicit-any`
- `pnpm test:server`
  - 结果：`116` 个测试文件通过，`2` 个测试文件失败，共 `3` 个失败用例。

### 当前测试失败说明

失败集中在 document-index backfill 集成测试：

- `tests/integration/document-index/document-index-backfill.db-queue.integration.test.ts`
- `tests/integration/document-index/document-index-backfill.worker-combo.integration.test.ts`

从命令输出看，当前本地环境没有可用的 Redis（`127.0.0.1:6379` / `::1:6379` 被拒绝），导致真实队列相关断言退化为 `enqueuedCount = 0`、`requeuedCount = 0`。这说明：

- 这些测试依赖外部 Redis，不是完全 hermetic。
- 当前 CI/本地测试文档需要更明确地说明前置依赖。

## 7. 建议整改顺序

1. 先修知识库删除编排。
   目标：消除“KB 已删但文档仍活跃”的主数据不一致。
2. 再修文档 delete / restore / version 的并发幂等问题。
   目标：把计数器与版本号竞争收敛到单一事务和实体锁。
3. 然后统一 OpenAPI 契约与 shared schema。
   目标：服务端、文档、客户端只保留一份真相。
4. 最后补测试策略。
   目标：增加一致性集成测试，减少 service 级重 mock 的假 E2E。

## 8. 一句话结论

这个仓库的“工程骨架”已经不错，但知识库删除编排、文档生命周期幂等性、API 文档契约三处还没有完全守住。下一轮重构应优先修一致性，而不是继续叠功能。
