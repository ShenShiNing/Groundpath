# Tool-Driven + Context Reasoning RAG 文件落点开发清单

> 配套文档：
>
> 1. `docs/tool-driven-reasoning-rag-migration-plan.md`
> 2. `docs/tool-driven-reasoning-rag-implementation-checklist.md`
>    文档状态：截至 `2026-03-11` 已按仓库真实进度更新。

## 1. 说明

本清单把 `implementation checklist` 中的 24 个 issue 进一步细化为：

1. **新增文件**
2. **修改文件**
3. **按文件的具体开发动作**

使用原则：

1. 优先遵循当前仓库分层：`controllers -> services -> repositories`
2. 新增结构化索引能力优先落在独立模块 `packages/server/src/modules/document-index/*`
3. 现有 `rag` queue / worker 继续复用，不额外建第二套写链路
4. Shared 契约变更必须同时检查 `types + schemas + client store + chat UI`

---

## 1.1 截至 2026-03-10 的实际状态

当前 24 个 issue 的真实状态如下：

| Issue | 状态     | 说明                                                                                                                                                                                                                       |
| ----- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | 已完成   | 选型结论：统一 docling；marker/pdf-parse 结构化运行时代码已移除                                                                                                                                                            |
| 2-10  | 已完成   | citation 契约、索引版本、队列 payload、Worker 路由、巡检脚本均已落地                                                                                                                                                       |
| 11-17 | 已完成   | parser 首版、结构化工具链、统一聊天编排、灰度控制已落地                                                                                                                                                                    |
| 18    | 部分完成 | 已有大量 unit / service / error-injection 测试，并新增 `docling` parser fixture、`pdf runtime`、`outline_search / node_read / ref_follow` integration 覆盖，仍缺 dedicated e2e / UI 专项                                   |
| 19-20 | 已完成   | `ref_follow`、引用边、检索材料增强首版已落地                                                                                                                                                                               |
| 21    | 部分完成 | backfill service / CLI 已落地，仍缺进度统计与调度                                                                                                                                                                          |
| 22    | 部分完成 | `shared/observability/structured-rag.metrics.ts`、summary API、dashboard v4、长期报表导出、邮件外部告警与基础告警治理已落地，告警归档与多渠道外发未实现                                                                    |
| 23    | 部分完成 | `document-index-cache.service.ts`、`outline_search` / `node_read` / 单节点读取 / `indexVersionId -> nodes` 缓存、preview 热点缓存、写路径精细失效、executor 级结果复用已落地，收益量化与更强 selective invalidation 未实现 |
| 24    | 未开始   | 默认开启评估未落地                                                                                                                                                                                                         |

使用方式调整：

1. 下文“新增文件 / 修改文件 / 开发动作”仍保留为文件落点参考。
2. 实际优先级以 `implementation checklist` 中的勾选状态和 `migration plan` 的阶段状态为准。
3. 如果下文某个 issue 写着“新增文件”，但文件已存在，则应理解为“该文件仍可能承载剩余补强任务”，而不是“尚未创建”。

---

## 2. 新增目录建议

说明：本节是最初的目录规划。截至 `2026-03-09`，大部分目录已经落地；仍明确未落地的主要是：

1. `packages/server/tests/integration/structured-rag/*`
2. `packages/client/tests/chat/structured-citation-ui.test.tsx`

建议新增以下目录，后续 issue 会反复引用：

### 2.1 Server

- `packages/server/src/modules/document-index/index.ts`
- `packages/server/src/modules/document-index/repositories/document-index-version.repository.ts`
- `packages/server/src/modules/document-index/repositories/document-node.repository.ts`
- `packages/server/src/modules/document-index/repositories/document-node-content.repository.ts`
- `packages/server/src/modules/document-index/repositories/document-edge.repository.ts`
- `packages/server/src/modules/document-index/services/document-index.service.ts`
- `packages/server/src/modules/document-index/services/document-parse-router.service.ts`
- `packages/server/src/modules/document-index/services/document-index-activation.service.ts`
- `packages/server/src/modules/document-index/services/document-index-backfill.service.ts`
- `packages/server/src/modules/document-index/services/parsers/markdown-structure.parser.ts`
- `packages/server/src/modules/document-index/services/parsers/docx-structure.parser.ts`
- `packages/server/src/modules/document-index/services/parsers/pdf-structure.parser.ts`
- `packages/server/src/modules/document-index/services/parsers/pdf-parser.runtime.ts`
- `packages/server/src/modules/document-index/services/search/outline-search.service.ts`
- `packages/server/src/modules/document-index/services/search/node-read.service.ts`
- `packages/server/src/modules/document-index/services/search/ref-follow.service.ts`
- `packages/server/src/modules/document-index/services/structured-rag-rollout.service.ts`
- `packages/server/src/modules/agent/tools/outline-search.tool.ts`
- `packages/server/src/modules/agent/tools/node-read.tool.ts`
- `packages/server/src/modules/agent/tools/ref-follow.tool.ts`
- `packages/server/src/modules/agent/tools/vector-fallback-search.tool.ts`

### 2.2 Shared

- `packages/shared/src/schemas/document-index.ts`
- 如不单独建 schema 文件，也至少扩展：
  - `packages/shared/src/types/chat.ts`
  - `packages/shared/src/schemas/chat.ts`

### 2.3 Client

- 原则上优先复用现有 chat 组件
- 若 citation UI 明显膨胀，可新增：
  - `packages/client/src/components/chat/CitationMeta.tsx`
  - `packages/client/src/components/chat/CitationBadgeList.tsx`

---

## 3. Issue -> 文件落点任务清单

说明：状态以 `1.1` 为准。下列内容保留为“该 issue 仍涉及哪些文件”的参考，不再默认表示“尚未开发”。

### Issue 1: 验证 PDF 解析运行时方案

目标：
验证并选定结构化 RAG PDF 运行时（已完成：统一 docling）。

新增文件：

- `packages/server/src/modules/document-index/services/parsers/pdf-structure.parser.ts`
- `packages/server/src/modules/document-index/services/parsers/pdf-parser.runtime.ts`（仅 docling）

修改文件：

- `packages/server/src/shared/config/env.ts`
- `packages/server/.env.example`
- `docs/tool-driven-reasoning-rag-migration-plan.md`

开发动作：

- PDF 运行时选型已收口：统一采用 docling。
- marker/pdf-parse 结构化运行时代码已清理。
- `DOCUMENT_INDEX_PDF_RUNTIME` 和 `DOCUMENT_INDEX_MARKER_COMMAND` 配置项已移除。
- 保留 `DOCUMENT_INDEX_PDF_TIMEOUT` 和 `DOCUMENT_INDEX_PDF_CONCURRENCY` 配置。

### Issue 2: 设计结构化 citation/source 契约

目标：
让 `node` 级证据能在 shared / server / client 间传递。

新增文件：

- 可选：`packages/shared/src/schemas/document-index.ts`

修改文件：

- `packages/shared/src/types/chat.ts`
- `packages/shared/src/schemas/chat.ts`
- `packages/shared/src/types/index.ts`
- `packages/shared/src/schemas/index.ts`
- `packages/server/src/shared/db/schema/ai/messages.schema.ts`

开发动作：

- 在 `types/chat.ts` 扩展 `Citation`，新增：
  - `sourceType`
  - `nodeId`
  - `documentVersion`
  - `indexVersion`
  - `sectionPath`
  - `pageStart/pageEnd`
  - `locator`
  - `excerpt`
- 在 `MessageMetadata` 增加：
  - `retrievedSources`
  - `finalCitations`
  - `stopReason`
- 在 `schemas/chat.ts` 为新增字段补充 Zod schema。
- 在 `messages.schema.ts` 更新 metadata 类型定义，保持向后兼容旧 citation。

### Issue 3: 设计 active index version 与任务新鲜度机制

目标：
解决“读哪个索引版本”和“旧任务不覆盖新版本结果”。

新增文件：

- `packages/server/src/modules/document-index/services/document-index-activation.service.ts`
- `packages/server/src/modules/document-index/repositories/document-index-version.repository.ts`

修改文件：

- `packages/server/src/shared/db/schema/document/documents.schema.ts`
- `packages/server/src/modules/rag/queue/document-processing.queue.ts`
- `packages/server/src/modules/rag/services/processing.service.ts`
- `packages/server/src/shared/config/env.ts`

开发动作：

- 在 `documents.schema.ts` 增加 `activeIndexVersionId` 或等价字段。
- 在 `document-processing.queue.ts` 扩展 job data：
  - `targetDocumentVersion`
  - `targetIndexVersion`
  - `reason`
- 在 `processing.service.ts` 加入版本新鲜度校验和 superseded 判定。
- 在 `document-index-activation.service.ts` 统一处理 active / superseded / failed / building 切换。

### Issue 4: 跑通结构化问答 MVP

目标：
跑通单文档的 `outline_search + node_read + answer` 闭环。

新增文件：

- `packages/server/src/modules/document-index/services/search/outline-search.service.ts`
- `packages/server/src/modules/document-index/services/search/node-read.service.ts`
- `packages/server/src/modules/agent/tools/outline-search.tool.ts`
- `packages/server/src/modules/agent/tools/node-read.tool.ts`

修改文件：

- `packages/server/src/modules/agent/tools/index.ts`
- `packages/server/src/modules/chat/services/prompt.service.ts`
- `packages/server/src/modules/chat/services/chat.service.ts`

开发动作：

- 在 `outline-search.service.ts` 先实现关键词版章节搜索。
- 在 `node-read.service.ts` 提供按 `nodeId` 读取内容与邻域。
- 在 agent tools 注册 `outline_search`、`node_read`。
- 在 `prompt.service.ts` 增加结构化工具提示词草案。
- 在 `chat.service.ts` 先接入 MVP 工具链，限定到实验开关。

### Issue 5: 新增结构化索引表与迁移

目标：
落地结构化索引 schema。

新增文件：

- `packages/server/src/shared/db/schema/document/document-index-versions.schema.ts`
- `packages/server/src/shared/db/schema/document/document-nodes.schema.ts`
- `packages/server/src/shared/db/schema/document/document-node-contents.schema.ts`
- `packages/server/src/shared/db/schema/document/document-edges.schema.ts`

修改文件：

- `packages/server/src/shared/db/schema/index.ts`
- `packages/server/src/modules/document-index/repositories/document-index-version.repository.ts`
- `packages/server/src/modules/document-index/repositories/document-node.repository.ts`
- `packages/server/src/modules/document-index/repositories/document-node-content.repository.ts`
- `packages/server/src/modules/document-index/repositories/document-edge.repository.ts`

开发动作：

- 为四张表定义字段、索引、外键与唯一约束。
- 在 `schema/index.ts` 导出新增 schema。
- 在 repository 层封装基础 CRUD、按文档 / 按版本读取、批量写入方法。

### Issue 6: 升级 shared citation 与消息 metadata

目标：
让 API 契约和 SSE 事件可承载结构化 citation。

修改文件：

- `packages/shared/src/types/chat.ts`
- `packages/shared/src/schemas/chat.ts`
- `packages/shared/src/types/index.ts`
- `packages/shared/src/schemas/index.ts`
- `packages/server/src/shared/db/schema/ai/messages.schema.ts`
- `packages/server/src/modules/chat/services/chat.service.ts`
- `packages/client/src/api/chat.ts`
- `packages/client/src/stores/chatPanelStore.types.ts`

开发动作：

- 统一 shared 类型与 schema。
- 在 `chat.service.ts` 把结构化 citation 写入 SSE `sources` 和 message metadata。
- 在 `api/chat.ts` 调整 `SSEHandlers.onSources` 的类型。
- 在 `chatPanelStore.types.ts` 扩展前端 store citation 结构与 `toStoreCitation()` 映射。

### Issue 7: 客户端支持节点级 citation 展示

目标：
在聊天 UI 正确渲染章节路径、页码区间和 excerpt。

新增文件：

- 可选：`packages/client/src/components/chat/CitationMeta.tsx`

修改文件：

- `packages/client/src/components/chat/CitationSources.tsx`
- `packages/client/src/components/chat/CitationPreview.tsx`
- `packages/client/src/components/chat/CitationInline.tsx`
- `packages/client/src/components/chat/ChatMessage.tsx`
- `packages/client/src/stores/chatPanelStore.types.ts`

开发动作：

- `CitationSources.tsx` 支持展示：
  - `sourceType`
  - `sectionPath`
  - `pageStart/pageEnd`
  - `locator`
- `CitationPreview.tsx` 从 `chunk` 视图改为 `chunk / node` 双模式。
- `ChatMessage.tsx` 保持引用点击和引用列表兼容旧消息。
- `toStoreCitation()` 为新字段提供稳定映射。

### Issue 8: 扩展队列 payload 与 Worker 状态机

目标：
让文档处理任务具备版本感知和 superseded 处理能力。

新增文件：

- `packages/server/src/modules/document-index/services/document-index.service.ts`

修改文件：

- `packages/server/src/modules/rag/queue/document-processing.queue.ts`
- `packages/server/src/modules/rag/services/processing.service.ts`
- `packages/server/src/modules/document/services/document-upload.service.ts`
- `packages/server/src/modules/document/services/document-content.service.ts`
- `packages/server/src/modules/document/services/document-version.service.ts`
- `packages/server/src/modules/document/services/document-trash.service.ts`
- `packages/server/src/modules/rag/index.ts`

开发动作：

- 在 enqueue 入口统一传入 `targetDocumentVersion`。
- 在 `processing.service.ts` 进入处理前拉取当前文档版本并比对。
- 若版本落后，标记当前索引为 `superseded` 并补排新任务。
- 将结构化索引构建封装到 `document-index.service.ts`，避免 `processing.service.ts` 继续膨胀。

### Issue 9: 扩展结构化索引巡检脚本

目标：
让 `db:check` 能巡检结构化索引一致性。

修改文件：

- `packages/server/src/scripts/db-consistency-check.ts`
- `packages/server/src/shared/db/schema/index.ts`

开发动作：

- 增加检查项：
  - orphan `document_nodes`
  - orphan `document_edges`
  - `activeIndexVersionId` mismatch
  - stale `building / failed` backlog
- 给结构化检查项编号并接入现有 summary 输出。

### Issue 10: Worker 增加路由逻辑与结构化解析入口

目标：
让长文档进入结构化索引流程，短文档保留 chunk 路径。

新增文件：

- `packages/server/src/modules/document-index/services/document-parse-router.service.ts`

修改文件：

- `packages/server/src/modules/rag/services/processing.service.ts`
- `packages/server/src/shared/config/env.ts`
- `packages/server/.env.example`

开发动作：

- 在 `document-parse-router.service.ts` 封装：
  - token 估算
  - 路由阈值判断
  - 强制结构化 / 强制 chunk 开关
- 在 `processing.service.ts` 根据 route mode 选择：
  - 原 chunking 流程
  - 新 document-index 流程
- 在配置中新增 `DOCUMENT_INDEX_ROUTE_TOKEN_THRESHOLD`。

### Issue 11: 实现 Markdown / DOCX / PDF 结构化解析器

目标：
构建统一的结构化解析接口与三类解析器实现。

新增文件：

- `packages/server/src/modules/document-index/services/parsers/markdown-structure.parser.ts`
- `packages/server/src/modules/document-index/services/parsers/docx-structure.parser.ts`
- `packages/server/src/modules/document-index/services/parsers/pdf-structure.parser.ts`
- 可选：`packages/server/src/modules/document-index/services/parsers/types.ts`

修改文件：

- `packages/server/src/modules/document-index/services/document-index.service.ts`
- `packages/server/src/modules/document/services/document-storage.service.ts`
- `packages/shared/src/types/document.ts`

开发动作：

- 为三类 parser 统一输出节点树 DTO。
- `document-index.service.ts` 调 parser 输出节点、内容、边。
- 必要时在 `document-storage.service.ts` 暴露更多 mime / 扩展名辅助信息。

### Issue 12: 实现 `outline_search`

目标：
提供结构化节点召回工具。

新增文件：

- `packages/server/src/modules/document-index/services/search/outline-search.service.ts`
- `packages/server/src/modules/agent/tools/outline-search.tool.ts`

修改文件：

- `packages/server/src/modules/agent/tools/tool.interface.ts`
- `packages/server/src/modules/agent/tools/index.ts`
- `packages/server/src/modules/document-index/repositories/document-node.repository.ts`
- `packages/server/src/modules/vector/vector.repository.ts`

开发动作：

- `document-node.repository.ts` 增加标题 / sectionPath / alias 的关键词查询接口。
- `outline-search.service.ts` 负责：
  - BM25 / 关键词召回
  - 可选向量召回
  - RRF 合并
- `outline-search.tool.ts` 把结果转成紧凑 JSON。
- 若节点标题向量复用 Qdrant，需要在 `vector.repository.ts` 补节点检索接口或单独 collection 约定。

### Issue 13: 实现 `node_read`

目标：
按节点读取正文和邻域信息，并带 token 截断。

新增文件：

- `packages/server/src/modules/document-index/services/search/node-read.service.ts`
- `packages/server/src/modules/agent/tools/node-read.tool.ts`

修改文件：

- `packages/server/src/modules/document-index/repositories/document-node.repository.ts`
- `packages/server/src/modules/document-index/repositories/document-node-content.repository.ts`
- `packages/server/src/modules/agent/tools/index.ts`
- `packages/server/src/shared/config/env.ts`

开发动作：

- `node-read.service.ts` 读取节点正文、上级标题、前后节点。
- 在 config 中新增 `AGENT_MAX_NODE_READ_TOKENS`。
- 工具结果必须包含：
  - `truncated`
  - `remainingTokenEstimate`

### Issue 14: 实现 `vector_fallback_search`

目标：
把现有知识库搜索从“默认主工具”降级为 fallback 工具。

新增文件：

- `packages/server/src/modules/agent/tools/vector-fallback-search.tool.ts`

修改文件：

- `packages/server/src/modules/agent/tools/kb-search.tool.ts`
- `packages/server/src/modules/agent/tools/index.ts`
- `packages/server/src/modules/chat/services/prompt.service.ts`
- `packages/server/src/modules/rag/services/search.service.ts`

开发动作：

- 将 `kb-search.tool.ts` 拆为：
  - 兼容层
  - 新的 `vector-fallback-search.tool.ts`
- 在 `prompt.service.ts` 改成“优先结构化，证据不足再 fallback”。
- `resolveTools` 不再把向量检索作为唯一 KB 工具。

### Issue 15: executor 增加预算与 stop reason

目标：
让预算和终止条件在 executor 层硬执行。

修改文件：

- `packages/server/src/modules/agent/agent-executor.ts`
- `packages/server/src/modules/agent/tools/tool.interface.ts`
- `packages/server/src/shared/config/env.ts`
- `packages/shared/src/types/chat.ts`
- `packages/server/src/modules/chat/services/chat.service.ts`

开发动作：

- 在 tool definition 上补分类信息：
  - `structured`
  - `fallback`
  - `external`
- 在 `agent-executor.ts` 增加预算计数与 `stopReason`。
- 在 `agent-executor.ts` 实现 5-pass evidence selection（`TaggedCitation` / `normalizeScore` / `isAncestorPath` / `filterSectionRedundancy` / diversity selection）。
- 在 `types/chat.ts` 的 `AgentStep` / `MessageMetadata` 中记录 `stopReason`。
- `chat.service.ts` 将 `stopReason` 写入消息 metadata。

### Issue 16: 统一 streaming / non-streaming 聊天编排

目标：
消除 agent mode 与 legacy path 的行为分叉。

新增文件：

- 可选：`packages/server/src/modules/chat/services/chat-orchestration.service.ts`

修改文件：

- `packages/server/src/modules/chat/services/chat.service.ts`
- `packages/server/src/modules/chat/services/prompt.service.ts`
- `packages/server/src/modules/agent/index.ts`
- `packages/client/src/api/chat.ts`
- `packages/client/src/stores/chatPanelStore.ts`

开发动作：

- 抽出统一的“构建消息 -> resolveTools -> execute -> assemble citations”流程。
- `sendMessageWithSSE` 与 `sendMessage` 共用同一 orchestration 层。
- `chatPanelStore.ts` 适配新的 sources / stopReason / tool trace 数据。

### Issue 17: 增加灰度开关与回退控制

目标：
支持按用户 / 知识库灰度，并可一键回退。

修改文件：

- `packages/server/src/shared/config/env.ts`
- `packages/server/.env.example`
- `packages/server/src/modules/chat/services/chat.service.ts`
- `packages/server/src/modules/rag/services/processing.service.ts`
- `packages/server/src/modules/document-index/services/document-parse-router.service.ts`

开发动作：

- 增加 feature flags：
  - `STRUCTURED_RAG_ENABLED`
  - `STRUCTURED_RAG_ROLLOUT_MODE`
- `chat.service.ts` 根据开关决定是否启用结构化编排。
- `processing.service.ts` 与 parse router 根据开关决定是否建结构化索引。

### Issue 18: 补齐最小测试矩阵

目标：
覆盖 happy path、失败回退、版本新鲜度与 citation 返回。

新增文件：

- `packages/server/tests/integration/structured-rag/structured-rag.e2e.test.ts`
- `packages/server/tests/integration/structured-rag/structured-rag.rollback.e2e.test.ts`
- `packages/server/tests/integration/structured-rag/structured-rag.error-injection.test.ts`
- `packages/shared/tests/chat/structured-citation.test.ts`
- `packages/client/tests/chat/structured-citation-ui.test.tsx`

修改文件：

- `packages/server/tests/*` 现有测试入口或 setup 文件
- `packages/client/tests/*` 现有测试入口或 setup 文件

开发动作：

- 服务器侧至少覆盖：
  - 上传后生成结构化索引
  - 解析失败回退 chunk
  - superseded 任务不激活
  - SSE 返回结构化 citation
- Shared 侧验证新 citation schema 序列化与兼容性。
- Client 侧验证节点级 citation 渲染。

### Issue 19: 构建引用边并实现 `ref_follow`

目标：
支持跨章节 / 附录 / 图表引用跟踪。

新增文件：

- `packages/server/src/modules/document-index/services/search/ref-follow.service.ts`
- `packages/server/src/modules/agent/tools/ref-follow.tool.ts`

修改文件：

- `packages/server/src/modules/document-index/repositories/document-edge.repository.ts`
- `packages/server/src/modules/document-index/services/document-index.service.ts`
- `packages/server/src/modules/agent/tools/index.ts`
- `packages/server/src/shared/config/env.ts`

开发动作：

- 在索引构建时抽取 `refers_to / cites` 边。
- 在 `ref-follow.service.ts` 做 BFS 遍历与深度截断。
- 在 config 中增加 `AGENT_REF_FOLLOW_MAX_DEPTH`。

### Issue 20: 增强结构化检索材料

目标：
提升泛化标题、图表、附录类查询命中率。

新增文件：

- 可选：`packages/server/src/modules/document-index/repositories/document-node-search.repository.ts`

修改文件：

- `packages/server/src/modules/document-index/services/document-index.service.ts`
- `packages/server/src/modules/document-index/services/search/outline-search.service.ts`
- `packages/server/src/modules/document-index/repositories/document-node.repository.ts`
- `packages/server/src/modules/document-index/repositories/document-node-content.repository.ts`

开发动作：

- 为节点补充 `searchableText` 或等价聚合材料。
- 把 `sectionPath / parent titles / contentPreview / alias anchors` 纳入检索。
- `outline-search.service.ts` 调整排序权重。

### Issue 21: 设计并实现旧文档批量回填

目标：
让存量文档逐步获得结构化索引。

新增文件：

- `packages/server/src/modules/document-index/services/document-index-backfill.service.ts`
- `packages/server/src/scripts/document-index-backfill.ts`

修改文件：

- `packages/server/src/modules/rag/queue/document-processing.queue.ts`
- `packages/server/src/shared/config/env.ts`
- `packages/server/package.json`

开发动作：

- 新增回填脚本，支持：
  - 按知识库
  - 按文档类型
  - 按分页 / 批次
- 在 queue payload 中写明 `reason=backfill`。
- 在 `package.json` 增加对应脚本命令。

### Issue 22: 增加结构化链路观测与面板

目标：
建立结构化 RAG 的基础指标面。

新增文件：

- 可选：`packages/server/src/shared/observability/structured-rag.metrics.ts`

修改文件：

- `packages/server/src/modules/chat/services/chat.service.ts`
- `packages/server/src/modules/agent/agent-executor.ts`
- `packages/server/src/modules/rag/services/processing.service.ts`
- `packages/server/src/modules/document-index/services/document-index.service.ts`
- `packages/server/src/shared/config/env.ts`

开发动作：

- 统一埋点以下指标：
  - parse success rate
  - structured coverage
  - fallback ratio
  - budget exhaustion rate
  - index freshness lag
- 若仓库尚无 metrics 模块，先通过结构化日志字段输出，后续再接面板。

### Issue 23: 缓存与性能优化

目标：
降低结构化链路的延迟与 token 成本。

新增文件：

- 可选：`packages/server/src/modules/document-index/services/document-index-cache.service.ts`

修改文件：

- `packages/server/src/modules/document-index/services/search/outline-search.service.ts`
- `packages/server/src/modules/document-index/services/search/node-read.service.ts`
- `packages/server/src/modules/chat/services/prompt.service.ts`
- `packages/server/src/modules/agent/agent-executor.ts`
- `packages/server/src/shared/config/env.ts`

开发动作：

- 缓存目录节点与高频节点 preview。
- `outline_search` 默认更多返回 preview、减少全文。
- `node_read` 对重复读取做缓存或短期去重。
- 压缩工具返回体，减少 LLM 消耗。

### Issue 24: 评估结构化主路径默认开启

目标：
基于指标决定是否默认开启结构化主路径。

修改文件：

- `docs/tool-driven-reasoning-rag-migration-plan.md`
- `docs/tool-driven-reasoning-rag-implementation-checklist.md`
- `docs/tool-driven-reasoning-rag-file-task-list.md`
- `packages/server/src/shared/config/env.ts`

开发动作：

- 汇总各阶段指标和问题清单。
- 调整 feature flag 默认值与 rollout 说明。
- 在文档中沉淀最终 Go / No-Go 决策与回退步骤。

---

## 4. 按文件分组的高频改动面

以下文件会在多个 issue 中反复出现，建议提前建立 owner：

### 4.1 Server 高频文件

- `packages/server/src/modules/rag/services/processing.service.ts`
- `packages/server/src/modules/rag/queue/document-processing.queue.ts`
- `packages/server/src/modules/chat/services/chat.service.ts`
- `packages/server/src/modules/chat/services/prompt.service.ts`
- `packages/server/src/modules/agent/agent-executor.ts`
- `packages/server/src/modules/agent/tools/index.ts`
- `packages/server/src/shared/config/env.ts`
- `packages/server/src/shared/db/schema/ai/messages.schema.ts`
- `packages/server/src/shared/db/schema/document/documents.schema.ts`
- `packages/server/src/scripts/db-consistency-check.ts`

### 4.2 Shared 高频文件

- `packages/shared/src/types/chat.ts`
- `packages/shared/src/schemas/chat.ts`
- `packages/shared/src/types/index.ts`
- `packages/shared/src/schemas/index.ts`

### 4.3 Client 高频文件

- `packages/client/src/api/chat.ts`
- `packages/client/src/stores/chatPanelStore.ts`
- `packages/client/src/stores/chatPanelStore.types.ts`
- `packages/client/src/components/chat/ChatMessage.tsx`
- `packages/client/src/components/chat/CitationSources.tsx`
- `packages/client/src/components/chat/CitationPreview.tsx`

---

## 5. 推荐切分方式

如果按开发者并行切分，建议如下：

1. **Shared / Contract 负责人**
   - Issue 2
   - Issue 6
2. **Index / Worker 负责人**
   - Issue 3
   - Issue 5
   - Issue 8
   - Issue 10
   - Issue 11
   - Issue 21
3. **Agent / Chat 负责人**
   - Issue 4
   - Issue 12
   - Issue 13
   - Issue 14
   - Issue 15
   - Issue 16
   - Issue 19
   - Issue 20
   - Issue 23
4. **Client / UX 负责人**
   - Issue 7
   - Issue 16
5. **Quality / Ops 负责人**
   - Issue 9
   - Issue 17
   - Issue 18
   - Issue 22
   - Issue 24
