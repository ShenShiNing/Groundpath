# RAG -> Document 边界收口建议

日期：2026-04-03

## 背景

当前 `document -> rag` 的直接调用已经基本切断：

- `document` 模块通过 `dispatchDocumentProcessing(...)` 发起处理请求。
- `rag` worker 通过 lifecycle event 回传处理开始/结束事件。
- `document-index` 已通过 listener 订阅回调。

这意味着原来的双向直接耦合已经明显下降。当前剩余问题不再是“有没有循环依赖”，而是：`rag` 是否还在依赖 `document` 的表级仓储细节，而不是依赖 `document/public/*` 暴露的语义能力。

## 边界原则

建议按下面的边界划分：

- `Document` 负责文档生命周期与状态机：`currentVersion`、`processingStatus`、`processingError`、`publishGeneration`。
- `Document` 对外暴露语义化 query/command port，不向外暴露“表怎么查、字段怎么改”。
- `RAG` 负责处理流程编排、向量生成、向量写入、流程级幂等与新鲜度判断。
- `DocumentIndex` 负责索引版本、激活、图结构、与索引构建强相关的持久化产物。

换句话说，`rag` 可以依赖“获取处理快照”“标记处理失败”这类能力，但不应直接依赖 `documentRepository.updateProcessingStatus()` 这类表级 API。

## 当前依赖分类

### 一、值得保留

#### 1. 权限复用

文件：

- `packages/server/src/modules/rag/rag.routes.ts`

当前依赖：

- `requireDocumentOwnership` from `@modules/document/public/ownership`

建议：

- 保留。

原因：

- 这是 `document` 模块显式公开的 ownership 能力，不属于仓储泄漏。

#### 2. 低风险只读投影

文件：

- `packages/server/src/modules/rag/services/search.service.ts`

当前依赖：

- `documentRepository.getActiveIndexVersionMap(...)`

建议：

- 短期可保留。
- 若后续要彻底统一风格，再收口为 query port。

原因：

- 这是纯查询、批量只读投影、无状态迁移。
- 它不直接修改文档生命周期状态，风险明显低于写侧依赖。

推荐后续能力名：

- `getActiveIndexVersionMap(documentIds)`

## 二、应改成 Document Query Port

#### 1. 处理快照查询

文件：

- `packages/server/src/modules/rag/services/processing.executor.helpers.ts`
- `packages/server/src/modules/rag/services/processing.stages.ts`

当前依赖：

- `documentRepository.findById(...)`
- `documentVersionRepository.findByDocumentAndVersion(...)`

建议：

- 改为语义化 query port。

原因：

- `rag` 实际需要的是“处理快照”，不是 `documents` / `document_versions` 表实体本身。
- 如果未来文档实体字段变化，或快照由多表拼装，`rag` 不应跟着改。

推荐后续能力名：

- `getProcessingSnapshot(documentId)`
- `getVersionContentSnapshot(documentId, version)`

推荐 DTO：

- `DocumentProcessingSnapshot`
- `DocumentVersionContentSnapshot`

建议字段范围：

- `DocumentProcessingSnapshot`
  - `id`
  - `userId`
  - `knowledgeBaseId`
  - `documentType`
  - `currentVersion`
  - `chunkCount`
  - `publishGeneration`
  - `updatedAt`
  - `activeIndexVersionId`
- `DocumentVersionContentSnapshot`
  - `documentId`
  - `version`
  - `textContent`
  - `fileName`
  - `documentType`

#### 2. 恢复任务候选查询

文件：

- `packages/server/src/modules/rag/services/processing-recovery.service.ts`

当前依赖：

- `documentRepository.listStaleProcessingDocuments(...)`

建议：

- 改为 workflow-oriented query port。

原因：

- 这不是通用仓储查询，而是“恢复卡住任务”的领域查询。
- 应由 `Document` owning module 对外提供“可恢复候选”视图。

推荐后续能力名：

- `listStaleProcessingCandidates({ staleBefore, limit })`

## 三、应改成 Document Command Port

#### 1. 处理状态迁移

文件：

- `packages/server/src/modules/rag/services/processing.stages.ts`

当前依赖：

- `documentRepository.updateProcessingStatus(...)`
- `documentRepository.updateProcessingStatusWithPublishGeneration(...)`

涉及位置：

- `resetToPending(...)`
- `upsertVectorPointsOrFail(...)`
- `markProcessingFailedWithFence(...)`

建议：

- 全部改为 command port。

原因：

- `processingStatus`、`processingError`、`publishGeneration` 都属于 `Document` 生命周期状态机。
- `rag` 可以决定“应该失败/回退”，但不应自己决定“表字段如何更新”。

推荐后续能力名：

- `markProcessingPending(documentId)`
- `markProcessingFailed({ documentId, message, expectedPublishGeneration? })`

#### 2. 卡住任务恢复

文件：

- `packages/server/src/modules/rag/services/processing-recovery.service.ts`

当前依赖：

- `documentRepository.resetStaleProcessingDocument(...)`

建议：

- 改为 command port。

原因：

- 这个动作不只是更新状态，还会推进 `publishGeneration`。
- 它属于明显的不变式敏感操作，应由 `Document` 模块拥有。

推荐后续能力名：

- `recoverStaleProcessingCandidate({ documentId, staleBefore })`

返回建议：

- `boolean` 或显式结果对象
- 是否恢复成功
- 恢复后版本号或新的 `publishGeneration`

## 四、应移出直接仓储调用，但更适合收口到 DocumentIndex

#### 1. chunk 持久化

文件：

- `packages/server/src/modules/rag/services/processing.stages.ts`

当前依赖：

- `documentChunkRepository.createMany(...)`

建议：

- 不建议继续由 `rag` 直接调用 `documentChunkRepository`。
- 但这个能力更适合收口到 `document-index/public/indexing`，而不是强行塞进 `document/public/*`。

原因：

- `document_chunks` 已经和 `indexVersionId` 强绑定。
- chunk 是“索引构建产物”，不是“文档元数据状态机”。
- 如果后续 chunk 结构、去重策略、持久化方式变化，应该由 `DocumentIndex` 承担演进成本。

推荐后续能力名：

- `persistChunkArtifacts({ indexVersionId, documentId, documentVersion, chunks })`

## 五、类型层面也要去仓储化

文件：

- `packages/server/src/modules/rag/services/processing.types.ts`

当前问题：

- 使用 `ReturnType<typeof documentRepository.findById>` 和
  `ReturnType<typeof documentVersionRepository.findByDocumentAndVersion>` 推导 `rag` 内部类型。

建议：

- 改为 `document/public/*` 显式导出的 DTO 类型。

原因：

- 这类类型推导会把 `rag` 静态绑定到仓储函数签名上。
- 即使运行时不直接耦合，类型层面仍然耦合在持久化实现上。

推荐后续类型：

- `DocumentProcessingSnapshot`
- `DocumentVersionContentSnapshot`
- `StaleProcessingCandidate`

## 六、建议的收口结果

### Document public processing/query/command

建议新增或扩展：

- `getProcessingSnapshot(documentId)`
- `getVersionContentSnapshot(documentId, version)`
- `getActiveIndexVersionMap(documentIds)` 可选
- `listStaleProcessingCandidates({ staleBefore, limit })`
- `markProcessingPending(documentId)`
- `markProcessingFailed({ documentId, message, expectedPublishGeneration? })`
- `recoverStaleProcessingCandidate({ documentId, staleBefore })`

### DocumentIndex public indexing

建议新增或扩展：

- `persistChunkArtifacts({ indexVersionId, documentId, documentVersion, chunks })`

## 七、推荐改造顺序

### 第一阶段：先收写侧

优先收掉：

- `updateProcessingStatus(...)`
- `updateProcessingStatusWithPublishGeneration(...)`
- `resetStaleProcessingDocument(...)`

原因：

- 写侧最容易破坏状态机和不变式，收益最高。

### 第二阶段：再收快照查询

收掉：

- `findById(...)`
- `findByDocumentAndVersion(...)`
- `listStaleProcessingDocuments(...)`

原因：

- 让 `rag` 从“依赖表结构”转向“依赖处理快照”。

### 第三阶段：最后处理低风险读投影

视收益决定是否收掉：

- `getActiveIndexVersionMap(...)`

原因：

- 这是只读批量投影，风险最低，放最后最合适。

## 八、结论

当前系统已经完成了第一层解耦：`document` 不再直接调用 `rag`。

下一步不建议追求“`rag` 完全不知道 document 存在”，而应该追求：

- `rag` 不依赖 `document` 的仓储实现细节。
- `rag` 只依赖 `document/public/*` 提供的语义化 query/command。
- 文档生命周期状态机留在 `Document` owning module。
- 索引构建产物留在 `DocumentIndex` owning module。

这条线收好之后，模块边界会更稳定，后续做事务收口、幂等增强、类型演进和服务拆分都会更容易。
