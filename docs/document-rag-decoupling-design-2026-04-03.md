# Document ↔ RAG 解耦改造方案

最后更新：2026-04-03

## 1. 当前结论

- `document` 主生命周期已经部分完成解耦：上传、编辑、恢复等链路通过 `dispatchDocumentProcessing` 风格的 port 触发处理，而不是直接依赖 RAG 队列实现。
- 这项改造还没有闭环完成：`document-index` 的 backfill 仍直接调用 `@modules/rag/public/queue`，RAG 队列实现也仍直接回调 `document-index` 的进度服务。
- 因此，当前状态应定义为“部分完成”，不能关闭“Document ↔ RAG 依赖解耦，引入事件/回调模式”这条高优先级项。

## 2. 现状问题

### 2.1 已完成的部分

- `packages/server/src/modules/document/ports/document-processing.port.ts`
- `packages/server/src/modules/document/public/processing.ts`
- `packages/server/src/index.ts`

当前 `document` 模块通过注册式 dispatcher 把“文档生命周期触发处理”与“RAG/BullMQ 具体实现”隔开，组合根负责接线。

### 2.2 未完成的耦合点

- `packages/server/src/modules/document-index/services/document-index-backfill.service.ts`
  - 直接依赖 `@modules/rag/public/queue`
  - backfill 逻辑知道 RAG 的 enqueue 入口
- `packages/server/src/modules/rag/queue/document-processing.queue.ts`
  - 直接依赖 `@modules/document-index/public/backfill-progress`
  - 队列 worker 知道 backfill run/item 的进度落库细节
- `packages/server/src/modules/rag/queue/document-processing.types.ts`
  - 通用队列契约中包含 `backfillRunId`
  - document-index 领域语义泄漏进 RAG 队列实现层

### 2.3 为什么现有架构门禁拦不住

当前 `dependency-cruiser` 主要覆盖：

- 禁止循环依赖
- 禁止跨模块 deep import
- 禁止跨模块 root barrel import

但它没有禁止“通过 `public/*` 做公开 API 级直接依赖”。因此：

- `document-index -> rag/public/queue`
- `rag -> document-index/public/backfill-progress`

这类依赖现在仍能通过 `pnpm architecture:check`。

## 3. 改造目标

本方案的目标不是把系统升级成完整消息总线，而是把模块边界收口到稳定契约上。

### 3.1 目标

- 让 `document`、`document-index` 都只依赖同一份“文档处理应用契约”
- 让 `rag` 负责实现处理队列，但不再直接理解 `document-index` 的进度服务
- 让组合根负责 wiring，而不是让 feature module 互相直接拿实现
- 保留现有行为语义：
  - `upload / edit / restore / retry / recovery / backfill`
  - 幂等 jobId 规则
  - backfill 进度状态推进

### 3.2 非目标

- 本阶段不引入 Kafka / NATS / Redis Stream 等新基础设施
- 本阶段不重写 BullMQ
- 本阶段不把所有异步副作用统一升级成 outbox/event bus

## 4. 推荐方案

推荐采用“轻量应用端口 + 生命周期监听”的方式，而不是直接上完整事件总线。

### 4.1 新增应用级契约层

建议新增目录：

- `packages/server/src/core/document-processing/`

这一层只定义应用契约，不依赖具体 feature module。建议包含：

- `dispatchDocumentProcessing(...)`
- `registerDocumentProcessingDispatcher(...)`
- `registerDocumentProcessingLifecycleListener(...)`
- `emitDocumentProcessingStarted(...)`
- `emitDocumentProcessingSettled(...)`

### 4.2 契约职责划分

#### Dispatcher

负责“请求一次文档处理”，由 RAG 队列实现。

调用方包括：

- `document` 上传/编辑/恢复/版本恢复
- `document-index` backfill
- 未来任何需要触发文档处理的模块

#### Lifecycle Listener

负责接收处理生命周期事件，例如：

- 已入队
- 开始处理
- 处理结束

监听方包括：

- `document-index` backfill progress
- 未来需要订阅处理状态的观测或补偿逻辑

### 4.3 组合根接线

由 `packages/server/src/index.ts` 统一负责：

1. 注册 dispatcher：把 `dispatchDocumentProcessing` 接到 RAG queue enqueue 实现
2. 注册 lifecycle listener：把 backfill progress listener 接到 document processing worker 生命周期

这样 feature module 不再互相持有对方实现。

## 5. 推荐接口草案

以下是建议的应用级契约形态：

```ts
export const DOCUMENT_PROCESSING_REASONS = [
  'upload',
  'edit',
  'restore',
  'retry',
  'backfill',
  'recovery',
] as const;

export type DocumentProcessingReason = (typeof DOCUMENT_PROCESSING_REASONS)[number];

export interface DocumentProcessingDispatchOptions {
  targetDocumentVersion: number;
  targetIndexVersion?: string;
  reason: DocumentProcessingReason;
  backfillRunId?: string;
  jobIdSuffix?: string;
}

export interface DocumentProcessingLifecycleEvent {
  documentId: string;
  userId: string;
  targetDocumentVersion: number;
  targetIndexVersion?: string;
  reason: DocumentProcessingReason;
  backfillRunId?: string;
  jobId?: string;
  attempt?: number;
  outcome?: 'completed' | 'skipped' | 'failed';
  error?: string;
}
```

说明：

- `backfillRunId` 可暂时保留在应用级契约中，先完成模块解耦，再决定是否进一步拆成 metadata
- `DocumentProcessingLifecycleEvent` 是应用事件，不等于消息中间件事件
- 这是一套进程内 contract，不要求引入新的持久化或 broker

## 6. 模块职责调整

### 6.1 `document`

保持现状思路不变：

- 上传、编辑、恢复、版本恢复继续只调用 `dispatchDocumentProcessing`
- 不直接依赖 `@modules/rag/public/queue`

### 6.2 `document-index`

需要新增两部分：

#### A. Backfill dispatch 改造

`document-index-backfill.service.ts` 从：

- 直接调用 `enqueueDocumentProcessing`

改成：

- 调用应用级 `dispatchDocumentProcessing`

这样 backfill 不再知道 RAG 队列入口。

#### B. Backfill lifecycle listener

新增一个 backfill listener，例如：

- `packages/server/src/modules/document-index/services/document-processing-backfill.listener.ts`

职责：

- 当 `reason !== 'backfill'` 时直接忽略
- `started` 时调用 `markProcessing`
- `settled` 时调用 `recordOutcome`

这样 backfill 进度推进回到 `document-index` 自己拥有的模块里。

### 6.3 `rag`

`rag` 只保留：

- 队列实现
- worker 启停
- enqueue jobId 规则
- 调用 processingService

删除：

- 对 `document-index/public/backfill-progress` 的直接依赖

改为：

- 在 worker 进入处理前发出 `started`
- 在 worker 完成后发出 `settled`

### 6.4 `core`

`core/document-processing` 只做契约和 registry：

- 不持有业务状态
- 不知道 backfill run 表结构
- 不知道 BullMQ 细节

## 7. 分阶段实施建议

建议按三个阶段推进，避免一次性改太大。

### 阶段 1：统一 dispatch 入口

目标：

- 让 `document-index` backfill 与 `document` 生命周期都走同一套 dispatch port

改动：

- 新增 `core/document-processing` 契约
- `document-index-backfill.service.ts` 改为依赖 `dispatchDocumentProcessing`
- `index.ts` 注册 dispatcher 到 RAG queue

收益：

- `document-index -> rag/public/queue` 依赖被删除
- 所有“触发文档处理”的入口统一到一层

风险：

- 低
- 主要是单测和集成测试 mock 路径需要同步调整

### 阶段 2：引入 lifecycle listener，反转进度依赖

目标：

- 删除 `rag -> document-index/public/backfill-progress`

改动：

- 在应用契约层增加 lifecycle listener registry
- RAG queue worker 在 started / settled 时发事件
- `document-index` 新增 backfill progress listener
- `index.ts` 注册 listener

收益：

- RAG worker 不再知道 backfill 表和进度服务
- backfill 进度逻辑完全回到 `document-index` 自己管理

风险：

- 中
- 需要仔细保持 `markProcessing` / `recordOutcome` 的调用时机与幂等性

### 阶段 3：补门禁与收紧契约

目标：

- 防止未来回流到旧耦合方式

改动：

- 为 `dependency-cruiser` 增加定向规则，禁止：
  - `document-index` 直接 import `rag/public/queue`
  - `document` 直接 import `rag/public/queue`
  - `rag` 直接 import `document-index/public/backfill-progress`
- 视落地情况再决定是否把 `backfillRunId` 从主契约继续抽象

收益：

- 这次解耦不是“口头约定”，而是有自动门禁

风险：

- 低

## 8. 测试调整建议

### 8.1 单测

当前 `document` 生命周期测试已经更接近目标状态，因为它们 mock 的是 dispatch port。

建议把 `document-index` backfill 单测也统一成：

- mock `dispatchDocumentProcessing`
- 不再 mock `@modules/rag/queue/document-processing.queue`

这样测试关注点会回到“本模块是否正确发出请求”，而不是“RAG 队列实现细节”。

### 8.2 集成测试

需要保留以下覆盖：

- backfill enqueue 后是否正确写入 run/item 状态
- worker started 时是否把 item 推进到 processing
- worker settled 时是否正确记录 completed / skipped / failed
- 恢复/重试场景是否不重复计数

### 8.3 测试基础设施

由于 registry 是进程级全局状态，建议提供 test-only reset 能力，例如：

- `resetDocumentProcessingDispatcherForTests()`
- `resetDocumentProcessingLifecycleListenersForTests()`

避免不同测试文件互相污染。

## 9. 门禁建议

建议在 `.dependency-cruiser.cjs` 里新增定向规则，而不是只依赖通用规则。

建议新增：

1. 禁止 `document` / `document-index` 直接导入 `@modules/rag/public/queue`
2. 禁止 `rag` 直接导入 `@modules/document-index/public/backfill-progress`
3. 允许组合根 `packages/server/src/index.ts` 负责接线

这类规则比“禁止所有 cross-module public import”更现实，因为仓库仍允许经 `public/*` 的正常跨模块复用。

## 10. 为什么现在不直接做 Outbox

当前问题的主轴是模块边界，而不是跨进程可靠投递。

直接上 outbox 的代价包括：

- 新增表与消费者
- 事务内事件持久化
- 事件重放与清理策略
- 更高的测试复杂度

对当前目标而言，这属于过度设计。

更合理的路径是：

1. 先用进程内 port/listener 把模块边界收口
2. 等 worker 真正拆成独立进程，或出现跨进程可靠交付诉求时，再升级成 outbox

## 11. 推荐落地顺序

如果按最小风险推进，建议顺序如下：

1. 新增 `core/document-processing` 契约与 registry
2. 把 `document-index-backfill.service.ts` 改成走 `dispatchDocumentProcessing`
3. 调整 backfill 单测与集成测试的 mock/接线方式
4. 为 RAG queue 增加 lifecycle emit
5. 新增 `document-index` backfill listener
6. 删除 RAG queue 对 backfill progress 的直接 import
7. 补 `dependency-cruiser` 定向规则

## 12. 预期结果

完成后应达到以下状态：

- `document` 不知道 RAG queue 实现
- `document-index` 不知道 RAG queue 实现
- `rag` 不知道 `document-index` 进度服务实现
- 模块间协作只通过应用契约和组合根 wiring 完成
- 架构门禁可以阻止旧耦合方式回流

这时，“Document ↔ RAG 依赖解耦，引入事件/回调模式”这条高优先级项才可以视为完成。
