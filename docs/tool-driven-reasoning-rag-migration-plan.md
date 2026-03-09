# Tool-Driven + Context Reasoning RAG 迁移方案（长文本 / 大文档）

> 配套执行文档：`docs/tool-driven-reasoning-rag-implementation-checklist.md`
> 文档状态：截至 `2026-03-10` 已按仓库实际实现进度校准。

## 0. 执行摘要（新版）

### 0.1 结论

当前方向保持不变：仓库已经实际演进到 `结构化检索主路径 + 向量检索兜底` 的 Hybrid 架构，且 `shared 契约 / 索引版本语义 / 结构化工具链 / 统一聊天编排 / stopReason` 均已进入可运行状态。

截至 `2026-03-10` 的真实阶段判断：

1. **P0-A 已完成**：结构化索引 schema、migration、citation 契约、队列 payload、新鲜度与巡检脚本都已落地。
2. **P0-B 大体完成**：Markdown / DOCX / PDF 首版解析、`outline_search`、`node_read`、`vector_fallback_search`、统一 streaming / non-streaming 编排与灰度控制都已实现。
3. **P1 部分完成**：`ref_follow`、引用边、检索材料增强已落地，但评测集和证据收口优化仍未完成。
4. **P2 已启动**：backfill service + CLI、结构化日志指标、summary API 与 dashboard v4（时间窗口 / 知识库筛选 / 趋势 / 告警 / 知识库分解 / 长期报表导出）已落地，且已支持邮件外部告警治理；缓存与性能专项已进入第二阶段。
5. **当前优先级**：接下来不应继续扩更多工具，而应优先补 `PDF 选型验证 / backfill 进度与调度 / 专项集成测试 / 缓存收益验证与深化`。

### 0.2 当前阶段总览

| 阶段 | 当前状态 | 说明 |
| ---- | -------- | ---- |
| **P-1** | **部分完成** | citation 契约、active version、MVP 和受控 PDF runtime 已落地；`marker / docling` 样本验证与最终选型未完成 |
| **P0-A** | **已完成** | schema、migration、shared 契约、消息 metadata、队列新鲜度、巡检脚本均已落地 |
| **P0-B** | **大体完成** | 主链路与灰度已上线到代码层；专门的 e2e / UI 集成测试与更强 evidence selection 仍缺 |
| **P1** | **部分完成** | `ref_follow`、引用边、检索材料增强已实现；评测集与收口优化未完成 |
| **P2** | **已启动** | backfill、观测、dashboard、报表、邮件告警已落地；缓存与性能专项已进入第二阶段 |
| **P3** | **未开始** | Go / No-Go 指标评估与默认开启决策未启动 |

### 0.3 当前建议优先级

| 优先级 | 必做事项 | 原因 |
| ------ | -------- | ---- |
| **Now-1** | 完成 `marker / docling` 样本验证与最终 PDF 运行时结论 | 当前 PDF 仍是 `pdf-parse + heuristic` 首版，不足以支撑大规模承诺 |
| **Now-2** | 完善 backfill 调度、进度与批次治理 | backfill 首版已落地，但还缺进度统计与运维能力 |
| **Now-3** | 补专门的 integration / e2e / client UI 测试 | 目前测试以 unit / service / error-injection 为主，少量专项集成测试仍缺 |
| **Now-4** | 做缓存收益验证与进一步 selective invalidation | 缓存已进第二阶段，但仍缺命中率 / token 节省的量化验证 |

---

## 1. 背景

当前系统主要基于 `chunk + embedding + vector search`。该方案在通用检索场景有效，但在整本书（PDF）、跨章节引用、长上下文推理场景容易出现：

1. 语义相似但证据不精确（召回偏题）。
2. 固定分块破坏文档结构（章节、小节、附录、图表关系丢失）。
3. 多跳问题需要“章节导航 + 引用跟踪”，仅靠相似度检索不稳定。
4. 现有 citation 以 `chunk` 为中心，无法充分表达“章节级 / 节点级 / 版本级”证据。

目标是升级为：`工具驱动 + 上下文推理` 主路径，向量检索作为兜底能力。

---

## 2. 当前仓库基线与迁移范围

### 2.1 已有能力（本次应复用，而不是重建）

当前仓库已经具备以下基础设施：

1. **异步文档处理队列与 Worker**
   - 上传、编辑、版本上传、版本恢复、回收站恢复后已走 `enqueueDocumentProcessing(...)`
   - `rag/queue/document-processing.queue.ts` 已有 BullMQ Worker 和重试能力
2. **Agent 工具循环**
   - `agent-executor.ts` 已支持 tool calling、工具并发执行、agent trace 记录
3. **聊天 SSE 与消息元数据**
   - 聊天流式返回已支持 `sources`、`tool_start`、`tool_end`
   - 消息 metadata 已可承载 `citations` 与 `agentTrace`
4. **向量检索 ACL 语义**
   - 已按 `userId / knowledgeBaseId / documentIds / isDeleted` 过滤搜索结果

### 2.2 当前缺口

当前真正缺失的已经不是“有没有结构化索引”或“有没有统一编排”，剩余缺口主要是：

1. **PDF 技术验证还未收口**
   - 当前已落地的是 `pdf-parse + heuristic` 首版与 timeout / concurrency / runtime 边界
   - `marker / docling` 样本对比、最终运行方式和资源结论仍未完成
2. **backfill 仅完成首版**
   - 已有 `documentIndexBackfillService` 与 CLI 脚本，可按知识库 / 文档类型 / 批次入队
   - 仍缺进度统计、批量调度、失败重试治理
3. **观测已完成 v4**
   - 已有 `agent_execution / chat_completion / index_build / index_graph` 结构化日志指标
   - 已有可查询的 summary API 与 dashboard（时间窗口 / KB 筛选 / 趋势 / 告警 / 知识库分解）
   - 已支持长期报表导出与邮件外部告警
   - 已支持告警去重、冷却抑制、严重度升级重发
   - 仍缺多渠道外发、人工确认/静默、长期历史报表归档
4. **evidence selection 仍是轻量版**
   - 当前已支持 citation 去重、`insufficient_evidence`、`tool_timeout`、`provider_error`
   - 但“最终答案真实使用证据”的强收口仍未完成
5. **缓存与性能已完成第二阶段**
   - `outline_search` 结果、`node_read` 结果、单节点读取、`indexVersionId -> nodes` 已有缓存
   - `outline_search` 已改为 header search + 顶部 preview 批量回填
   - 已有更精细的写路径缓存失效，以及 executor 级跨工具结果复用
   - tool 输出已改为紧凑 JSON，legacy prompt 上下文已做按源截断
   - 但缓存命中率观测、收益量化与更强 selective invalidation 仍未完成
6. **专项测试矩阵仍未完全补齐**
   - 已有较多 unit / service / error-injection 测试
   - 但文档中规划的 dedicated e2e / client citation UI 测试仍未落地

### 2.3 本次迁移范围

本次迁移聚焦：

1. 长文档 / 大文档的结构化解析与节点级检索。
2. 结构化工具优先、向量检索兜底的混合问答。
3. 版本化索引、回滚、灰度、观测与巡检。

本次不纳入范围：

1. 全量替换所有向量检索能力。
2. 一次性覆盖所有 PDF 版式极端场景。
3. 新建第二套独立文档处理基础设施。
   - 优先扩展现有 `rag` queue / worker

---

## 3. 目标架构（Hybrid，逐步演进）

### 3.1 总体原则

1. 不一次性移除向量检索，先做双轨（结构化主路径 + 向量兜底）。
2. 检索和推理解耦：先“定位证据”，再“组织回答”。
3. 证据优先：回答必须绑定可追溯引用（章节 / 页码 / 节点 ID / 索引版本）。
4. 读路径只读取 **active** 索引版本，禁止读取 building / failed 版本。
5. 任务执行必须对“文档版本前进”安全，即旧任务不得覆盖新任务结果。
6. 短文档保持低成本路径，长文档才进入结构化路径。

### 3.2 主查询流程

1. 用户提问进入 Chat / Agent。
2. Agent 优先调用结构化工具定位文档节点（目录、章节、引用图）。
3. Agent 读取候选节点原文与上下文邻域，必要时跟踪跨引用。
4. 若证据不足，再调用向量兜底工具补召回。
5. 执行 evidence selection / citation dedupe。
6. 生成带 citation 的答案并通过 SSE / message metadata 返回。

### 3.3 写路径

1. 上传 / 编辑 / 恢复文档后，API 仅入队任务。
2. Worker 异步执行：路由判断 -> 结构解析 -> 构建节点图 -> 可选向量化 -> 激活新版本索引。
3. 回写文档处理状态、索引版本状态、错误信息与解析质量指标。

### 3.4 回退与灰度路径

1. 结构化解析失败或置信度不足时，自动降级到传统 chunk 路径。
2. 灰度开关按用户 / 知识库 / 文档类型控制。
3. 保留一键回退到纯向量主路径的开关。

---

## 4. 数据契约与兼容性

### 4.1 Citation / Source 契约升级

当前 citation 结构是 `chunk` 导向，无法表达节点级证据。迁移前必须先定义统一 source 契约，并同步用于：

1. 聊天 SSE `sources`
2. 消息 metadata.citations
3. 评测与观测
4. 前端 citation 渲染

建议新契约如下：

| 字段 | 说明 | 兼容性要求 |
| ---- | ---- | ---------- |
| `sourceType` | `chunk` / `node` | 必填 |
| `documentId` | 文档 ID | 兼容旧字段 |
| `documentTitle` | 文档标题 | 兼容旧字段 |
| `documentVersion` | 证据来自哪个文档版本 | 新增 |
| `indexVersion` | 证据来自哪个索引版本 | 新增 |
| `nodeId` | 结构化节点 ID | `sourceType=node` 时必填 |
| `chunkIndex` | 旧 chunk 编号 | `sourceType=chunk` 时保留 |
| `sectionPath` | 章节路径，如 `['第 3 章', '3.2 检索流程']` | 新增 |
| `pageStart/pageEnd` | 页码区间 | 新增 |
| `locator` | 可展示定位符，如 `第 3 章 / p.42-45` | 新增 |
| `excerpt` | 用于展示的证据摘录 | 新增 |
| `score` | 召回分数 | 保留 |

### 4.2 兼容策略

1. 旧消息中的 `chunkIndex` citation 继续可读。
2. 前端渲染逻辑按 `sourceType` 分支：
   - `chunk`：维持旧展示
   - `node`：优先展示 `sectionPath + page range + excerpt`
3. 结构化上线初期允许 `chunk` 与 `node` citation 混合返回。
4. 对外 API 不删除旧字段，至少保留一个迁移周期。

### 4.3 结果归因约束

1. 工具返回的 citation 不等于最终答案真实使用的 citation。
2. 在最终回答前需要做一次 evidence selection：
   - 去重
   - 截断
   - 过滤掉未被最终回答使用的弱证据
3. 评测时区分：
   - `retrievedSources`
   - `finalCitations`

---

## 5. 文档结构解析策略

### 5.1 按文档类型的解析方案

| 文档类型 | 解析方案 | 说明 |
| -------- | -------- | ---- |
| **Markdown** | 原生 heading 解析（`#` ~ `######`） | 准确率最高，直接构建节点树 |
| **DOCX** | heading style 解析（Heading 1 ~ Heading 6） | 正文归属最近的上级标题 |
| **PDF** | `marker / docling + LLM` 分层降级 | 见 §5.2 |
| **TXT / 纯文本** | 启发式分段（空行 + 行首模式匹配） | 无法识别结构时整文档作为单节点 |

### 5.2 PDF 结构解析分层策略

PDF 是结构解析难度最高的格式，采用分层降级方案：

1. **首选：marker**
   - 基于视觉布局与字体大小推断标题层级
   - 适合排版规范的书籍、论文、技术文档
   - 若输出 Markdown，可直接复用 Markdown 解析逻辑
2. **备选：docling**
   - 对学术论文、双栏排版更友好
   - 是否引入由 P-1 技术验证决定
3. **兜底：LLM 辅助结构推断**
   - 仅在解析置信度不足时触发
   - 只用于补齐目录 / 标题层级，不替代全文解析

### 5.3 PDF 解析运行时边界（新增）

P-1 必须确认解析器如何在现有服务中运行，而不是默认其可直接嵌入 Node 进程：

1. 运行方式三选一：
   - 独立 sidecar 服务
   - 受控子进程
   - 独立解析 worker
2. 每次解析必须有：
   - `timeout`
   - CPU / 内存限制
   - 并发上限
   - 明确错误分类（超时 / OOM / 解析失败 / 不支持版式）
3. 失败后必须可降级到 chunk 路径，且不影响文档可检索性。

### 5.4 解析质量下限与回退机制

最低要求：

1. 至少识别出文档一级标题（章 / 节），否则视为结构化失败。
2. 页码映射不能大面积缺失，否则不激活结构化索引。
3. 节点树不能出现大规模 orphan 节点。

建议记录以下质量指标，而不只记录 `headingCount`：

1. `parseMethod`：`structured / chunked`
2. `parserRuntime`：`marker / docling / llm-assisted / fallback`
3. `parseConfidence`
4. `headingCount`
5. `orphanNodeRatio`
6. `pageCoverage`
7. `parseDurationMs`

回退策略：

1. 解析失败：直接走传统 chunk 模式。
2. 结构存在但置信度低：保留索引结果，但不激活为主路径，只作实验数据。
3. 激活后若线上异常率升高：灰度关闭并回退到向量主路径。

### 5.5 文档路由策略

根据文档长度选择不同处理路径，避免对短文档做不必要的结构化开销：

| 文档长度 | 处理路径 | 理由 |
| -------- | -------- | ---- |
| **短文档**（< 5,000 tokens） | 传统 chunk 路径 | 结构化收益低，chunk 检索已足够精确 |
| **长文档**（≥ 5,000 tokens） | 结构化解析路径 | 章节导航与跨引用价值显著 |

补充约束：

1. token 计数使用与 embedding 相同的 tokenizer，保证阈值一致。
2. 路由决策在 Worker 入口执行，并写入索引版本元数据。
3. 若文档虽然短但存在显式目录 / 附录 / 图表密集结构，可通过灰度开关强制走结构化路径。

---

## 6. 数据与索引设计

建议新增 `document-index` 领域模型，但优先依附现有后端模块体系与 worker 链路实现。

### 6.1 核心表设计

1. `document_index_versions`
   - 建议字段：
   - `id, documentId, documentVersion, indexVersion, routeMode(structured/chunked), status(building/active/failed/superseded), parseMethod, parserRuntime, parseConfidence, error, workerJobId, builtAt, activatedAt`
   - 用途：
   - 记录一次索引构建尝试及其状态
   - 区分“构建成功”和“已激活”
2. `document_nodes`
   - `id, documentId, indexVersionId, nodeType(chapter/section/paragraph/table/figure/appendix), title, depth, sectionPath, pageStart, pageEnd, parentId, orderNo, tokenCount, stableLocator`
   - `sectionPath` 用于检索、展示和 citation
   - `stableLocator` 用于输出类似 `Chapter 3 > 3.2 > Table 3-1`
3. `document_node_contents`
   - `nodeId, content, contentPreview, tokenCount`
4. `document_edges`
   - `fromNodeId, toNodeId, edgeType(parent/next/refers_to/cites), anchorText`
5. `document_node_search_materialized`（可选）
   - `nodeId, searchableText`
   - 用于聚合 `title + sectionPath + 首段摘要 + 别名锚点`

### 6.2 active index version 语义（新增）

必须显式定义“当前生效版本”：

1. 文档读路径始终只读 `status=active` 的索引版本。
2. 新索引构建完成后，先校验完整性，再执行激活切换。
3. 旧版本在保留窗口内标记为 `superseded`，支持回滚和排查。

建议补充以下之一：

1. 在 `documents` 上记录 `activeIndexVersionId`
2. 或在 `document_index_versions` 上保证同一文档仅有一个 `active`

### 6.3 索引更新策略

采用 **全量重建** 策略：

1. 文档更新时，Worker 重新解析并构建完整节点图，替换旧版本索引。
2. 不采用增量更新。
   - 原因：文档结构变更可能导致节点 ID、章节路径、页码与边关系大面积变化。
3. 旧版本延迟清理。
   - 便于回滚、比对、问题排查。

### 6.4 任务新鲜度与幂等（新增）

当前队列已用 `documentId` 去重，但结构化迁移后必须补充任务新鲜度语义。

建议队列 payload 升级为：

1. `documentId`
2. `userId`
3. `targetDocumentVersion`
4. `targetIndexVersion`
5. `reason(upload/edit/restore/retry/backfill)`

Worker 行为要求：

1. 开始执行前校验当前文档版本是否仍等于 `targetDocumentVersion`。
2. 若执行期间文档版本已前进：
   - 当前任务可以完成构建，但不得激活为 active
   - 标记为 `superseded`
   - 自动补排新版本任务
3. 激活动作必须幂等，重复执行不应破坏现有 active 版本。

### 6.5 查询语义与权限约束

结构化查询必须继承当前向量查询的访问控制语义：

1. 按 `userId` 过滤
2. 按 `knowledgeBaseId` 过滤
3. 按 `documentIds` 过滤
4. 排除软删除文档 / 失效索引版本

不能因为新增结构化索引而绕过已有 ACL。

### 6.6 图遍历性能约束

1. `ref_follow.maxDepth` 上限为 3。
2. 遍历采用应用层 BFS，每层批量查询边表。
3. 单次遍历返回节点总数上限为 20。
4. 单次 `node_read` 返回总 token 数上限应受全局预算控制。

### 6.7 检索特征补充（新增）

`outline_search` 不能只索引标题本身。建议将以下特征纳入可检索材料：

1. `title`
2. `sectionPath`
3. 首段摘要 / `contentPreview`
4. 常见别名锚点
   - 如“附录 A”“图 3-2”“表 4.1”
5. 上级标题链

---

## 7. 工具设计与 Agent 执行约束

### 7.1 主路径工具

1. `outline_search`
   - 输入：`query, documentIds?, kbId?, includeContentPreview?`
   - 输出：节点候选列表
   - 返回字段建议：
   - `nodeId, title, sectionPath, pageStart, pageEnd, score, matchReason, contentPreview?`
   - 召回机制：
   - 关键词路径：BM25 / 精确术语匹配
   - 语义路径：节点标题 / 路径向量
   - 合并排序：RRF
2. `node_read`
   - 输入：`nodeIds[], maxTokensPerNode`
   - 输出：节点原文与邻域信息
   - 返回字段建议：
   - `nodeId, title, sectionPath, content, parent, prev, next, truncated`
3. `ref_follow`
   - 输入：`nodeId, depth?, edgeTypes?`
   - 输出：跨引用链路
   - 返回字段建议：
   - `path[], truncated, maxDepthReached`
4. `vector_fallback_search`
   - 仅在结构化证据不足时触发
   - 语义上替代当前 `knowledge_base_search`

### 7.2 工具输出格式约束（新增）

为控制 token 与避免“把整段原文直接拼给模型”，工具默认应返回 **紧凑结构化 JSON + 小片段 preview**，而不是大段拼接文本。

约束如下：

1. `outline_search` 默认不返回全文。
2. `node_read` 必须受 `maxTokensPerNode` 和全局预算控制。
3. 任一工具返回内容超过阈值时，必须显式标记：
   - `truncated: true`
   - `remainingTokenEstimate`
4. 工具结果中的 `contentPreview` 优先用于初筛，只有必要时再放大读取。

### 7.3 Agent 工具调用预算策略

预算必须由 executor 强制执行，不能只依赖 prompt：

| 预算类别 | 上限 | 说明 |
| -------- | ---- | ---- |
| `structuredRounds` | ≤ 3 | 覆盖“定位 -> 阅读 -> 跟踪引用” |
| `fallbackRounds` | ≤ 1 | 仅在结构化证据不足时调用 |
| `totalRounds` | ≤ 5 | 全链路工具调用上限 |
| `perToolTimeoutMs` | 配置项 | 单工具超时控制 |

新增 executor 停止原因：

1. `answered`
2. `insufficient_evidence`
3. `budget_exhausted`
4. `tool_timeout`
5. `user_aborted`
6. `provider_error`

### 7.4 最终证据收口（新增）

Agent executor 在生成最终答案前，应执行一轮轻量 evidence selection：

1. citation 去重
2. 相同节点合并
3. 过弱证据过滤
4. 若证据不足，显式输出“证据不足”而不是伪造引用

### 7.5 Prompt 与 executor 的职责分离

Prompt 仍然需要提示：

1. 优先使用结构化工具
2. 证据不足再走 fallback
3. 不得无证据硬答

但真正的约束应由 executor 落地：

1. 工具分类
2. 预算统计
3. 调用顺序约束
4. 终止条件

### 7.6 读链路统一（新增）

迁移后 streaming 与 non-streaming 必须共享同一套编排逻辑：

1. 同一套 tool resolution
2. 同一套 citation 结果
3. 同一套 fallback 策略
4. 同一套 stop reason / trace 记录

避免出现：

1. SSE 路径返回结构化 citation
2. 非流式路径仍返回旧 chunk citation

---

## 8. 与现有仓库的改造映射

### 8.1 服务端模块

新增建议：

1. `packages/server/src/modules/document-index/*`
2. `packages/server/src/modules/agent/tools/outline-search.tool.ts`
3. `packages/server/src/modules/agent/tools/node-read.tool.ts`
4. `packages/server/src/modules/agent/tools/ref-follow.tool.ts`

改造建议：

1. `packages/server/src/modules/rag/queue/document-processing.queue.ts`
   - 扩展现有 job payload
   - 增加任务新鲜度语义
2. `packages/server/src/modules/rag/services/processing.service.ts`
   - 从 chunk-only 处理扩展为：
   - 路由判断 -> 结构化索引构建 -> 可选向量化 -> 版本激活
3. `packages/server/src/modules/agent/tools/index.ts`
   - 调整 `resolveTools`
   - 结构化工具优先挂载
   - 向量工具作为 fallback 或兼容别名
4. `packages/server/src/modules/agent/agent-executor.ts`
   - 增加工具分类预算、停止原因、citation 去重
5. `packages/server/src/modules/chat/services/chat.service.ts`
   - streaming / non-streaming 统一走同一编排逻辑

### 8.2 Shared 契约与客户端

需要同步改造：

1. `packages/shared/src/types/chat.ts`
   - 扩展 citation 结构
2. SSE `sources` 事件
   - 支持节点级 citation
3. 消息 metadata
   - 支持记录 `stopReason / retrievedSources / finalCitations`
4. 客户端 citation UI
   - 新增章节路径、页码区间、版本信息展示

### 8.3 配置项

建议新增配置分层：

1. `documentIndex.*`
   - `routeTokenThreshold`
   - `parseTimeoutMs`
   - `parserRuntime`
   - `minParseConfidence`
2. `agent.*`
   - `maxStructuredRounds`
   - `maxFallbackRounds`
   - `perToolTimeoutMs`
   - `maxNodeReadTokens`
3. `featureFlags.*`
   - `structuredRagEnabled`
   - `structuredRagRolloutMode`
4. `backfill.*`
   - 批量回填并发与速率限制

### 8.4 CI 架构门禁

CI 架构门禁仍建议独立 issue 跟踪，但至少补充以下约束：

1. 禁止模块循环依赖。
2. 禁止 `routes` 跨模块直接依赖他模块 controller。
3. 禁止 controller 直连 repository（必须经 service）。
4. 结构化索引模块不得反向依赖 chat controller / route。

---

## 9. 分阶段实施计划（重排后）

### P-1（状态：部分完成）：先验证“能不能稳落地”

当前状态：

1. 已完成 citation 契约、active version 语义、队列 payload 扩展、`outline_search + node_read` MVP、单文档结构化问答闭环。
2. 已补 `pdf-parse` 受控 runtime 的 `timeout / concurrency / runtime` 配置与错误分类。
3. 仍未完成 `marker / docling` 样本验证、最终选型结论与 token / 延迟样例沉淀。

当前剩余动作：

1. 准备 3-5 个 PDF 样本并补 `marker / docling` 对比。
2. 明确是否采用 sidecar / 子进程 / 独立 worker。
3. 补一次完整的 token / 延迟 / citation 样例记录。

交付标准：

1. 有明确的 PDF 解析技术选型与运行时结论。
2. 有结构化 citation 契约草案。
3. 至少 1 篇文档可跑通“结构化检索 -> 阅读 -> 回答”闭环。
4. 有 active version / superseded 设计说明。

### P0-A（状态：已完成）：先打基础契约与一致性

已完成：

1. `document_index_versions / document_nodes / document_node_contents / document_edges` schema 与 Drizzle migration 已落地。
2. shared citation 契约、SSE `sources`、message metadata、client citation 渲染已落地。
3. 队列 payload 已包含 `targetDocumentVersion / targetIndexVersion / reason`。
4. Worker 已支持 active version / superseded / freshness check。
5. `db:check` 已扩展 active mismatch、orphan nodes / edges、stale index backlog 检查。

交付标准：

1. 结构化索引数据可落库并可安全切换 active 版本。
2. SSE 与消息元数据能承载节点级 citation。
3. 旧版本任务不会覆盖新版本结果。

### P0-B（状态：大体完成）：最小可用 Hybrid 主链路

已完成：

1. Worker 已支持长短文档路由、Markdown / DOCX / PDF 首版结构解析、解析失败回退 chunk。
2. `outline_search`、`node_read`、`vector_fallback_search`、`resolveTools` 主链路已落地。
3. streaming / non-streaming 已统一走 agent orchestration。
4. `STRUCTURED_RAG_ENABLED`、`STRUCTURED_RAG_ROLLOUT_MODE` 以及按 `userId / knowledgeBaseId` allowlist 的 internal 灰度已落地。
5. executor 已支持 `budget_exhausted / tool_timeout / provider_error / insufficient_evidence / user_aborted` 相关 stopReason。

剩余动作：

1. 补 dedicated integration / e2e / UI 测试。
2. 继续增强 evidence selection，而不是只做 citation 去重。

### P1（状态：部分完成）：跨引用能力与检索质量增强

已完成：

1. `ref_follow` 与 `refers_to / cites` 边已落地。
2. `sectionPath / alias anchor / contentPreview` 已进入首版检索材料。

剩余动作：

1. 补跨章节 / 附录 / 图表评测集。
2. 继续优化 citation 收口与 evidence selection。
3. 图表 / 附录锚点解析仍需补强。

### P2（状态：已启动）：回填、性能与观测收敛

已完成：

1. `document-index backfill` 首版 service 和 CLI 已落地。
2. 已支持按 `knowledgeBaseId / documentType / limit / offset` 批量筛选候选文档并以 `reason=backfill` 入队。
3. `outline_search` 短 TTL 缓存、`node_read` 结果缓存、`indexVersionId -> node list` 缓存已落地。

剩余动作：

1. 增加回填进度统计和批量调度能力。
2. 基于现有结构化日志指标继续深化 structured RAG dashboard 与告警。
3. 深化 cache / perf 专项优化。

1. 建立旧文档批量回填任务。
2. 建立离线评测与线上观测（成功率、延迟、工具调用次数、预算耗尽率）。
3. 优化 Worker 并发、重试、死信、缓存。
4. 对高频节点和目录摘要做缓存。

### P3（状态：未开始）：按指标决定是否弱化向量主路径

1. 仅当结构化主路径在核心指标持续达标，再降低向量依赖权重。
2. 保留可开关的回退策略。
3. 保留向量路径作为极端场景兜底。

---

## 10. 回填、灰度与运维

### 10.1 旧文档回填策略（新增）

结构化索引上线后，不能只覆盖新增文档，还需要批量回填现有文档。

当前状态：**首版已落地**。目前已有：

1. `documentIndexBackfillService`
2. `document-index-backfill.ts` CLI
3. `reason=backfill` 入队语义

当前仍缺：

1. 进度统计与批次报表
2. 定时调度 / 自动分批
3. 失败批次的重试和治理

建议：

1. 按知识库 / 文档类型 / 文档大小分批回填。
2. 先回填高价值长文档，再回填普通文档。
3. 回填任务写入 `reason=backfill`，与在线写入任务区分。
4. 回填过程中保留现有 chunk 检索能力，不中断服务。

### 10.2 一致性巡检（新增）

当前状态：**已落地 v1**。现有 `db:check` 已扩展以下检查项：

1. orphan `document_nodes`
2. orphan `document_edges`
3. `documents.activeIndexVersionId` 与实际 active 版本不一致
4. `document_index_versions.status=building` 长时间滞留
5. `document_nodes.orderNo` 重复或断层
6. 删除 / 恢复文档后残留失效节点

### 10.3 灰度策略

当前状态：**已落地 v1**。当前已支持：

1. `STRUCTURED_RAG_ENABLED`
2. `STRUCTURED_RAG_ROLLOUT_MODE=disabled|internal|all`
3. `internal` 模式下按 `userId / knowledgeBaseId` allowlist 控制

仍未完成：

1. 管理后台级别的灰度配置面
2. 按文档类型的更细粒度可视化策略

1. 先按内部账号灰度。
2. 再按知识库灰度。
3. 最后按文档类型灰度。

推荐灰度顺序：

1. Markdown 长文档
2. DOCX 长文档
3. PDF（排版规范）
4. PDF（复杂双栏 / 图表密集）

### 10.4 生命周期语义

必须明确以下场景的索引行为：

1. **上传**：创建初始 active 索引或 chunk 路径索引
2. **编辑**：新版本入队，旧 active 保持可读，直到新版本激活
3. **版本恢复**：恢复后重新构建索引，不复用旧 active 版本状态
4. **删除 / 软删除**：结构化索引读路径必须不可见
5. **恢复**：重新入队并重新计算 active 版本

---

## 11. 评测与验收指标

建议至少覆盖以下指标：

1. `Answer Groundedness`
   - 回答句子可被证据节点支持的比例
2. `Citation Precision`
   - 引用是否指向正确章节 / 页码 / 节点
3. `Multi-hop Success Rate`
   - 跨章节 / 附录 / 图表问题正确率
4. `P95 Latency`
   - 长文档问答端到端时延
5. `Fallback Ratio`
   - 进入向量兜底的请求比例
6. `Budget Exhaustion Rate`
   - 工具预算耗尽比例
7. `Structured Coverage`
   - 长文档中成功激活结构化索引的比例
8. `Parse Success Rate`
   - 结构解析成功率
9. `Index Freshness Lag`
   - 文档版本更新到 active 索引可读之间的延迟

---

## 12. 成本评估

### 12.1 查询成本

工具驱动方案相比纯向量检索，会带来额外 token、数据库查询与编排成本。

| 阶段 | 估算 token 消耗 | 说明 |
| ---- | --------------- | ---- |
| 工具调用决策（每轮） | ~300-500 tokens | Agent 分析当前状态并选择工具 |
| `outline_search` 结果解析 | ~200-500 tokens | 紧凑 JSON + preview |
| `node_read` 内容消费 | ~800-3,000 tokens | 取决于节点数与 `maxTokensPerNode` |
| `ref_follow` 链路解析 | ~300-800 tokens | 取决于链路复杂度 |
| 最终答案生成 | ~500-1,500 tokens | 含 citation 组织 |
| **单次查询总额外消耗** | **~2,100-6,300 tokens** | 显著高于纯向量检索 |

### 12.2 写路径成本（新增）

相比当前 chunk-only 处理，结构化写路径还会新增：

1. PDF 解析 CPU / 内存成本
2. 节点表与边表存储成本
3. 可选节点检索索引或节点向量化成本
4. 旧版本保留窗口带来的临时存储成本

### 12.3 成本优化建议

1. 缓存高频节点摘要与目录节点。
2. `outline_search` 支持 `includeContentPreview`，降低 `node_read` 次数。
3. 严格控制工具输出格式，避免大段原文直传模型。
4. 短文档维持 chunk 路径。
5. `ref_follow` 仅在存在跨引用需求时调用。

---

## 13. 风险与控制

1. 风险：工具链变长导致延迟上升。
   - 控制：executor 级预算、单工具超时、证据不足时尽早停止。
2. 风险：结构化索引质量不稳定。
   - 控制：索引版本化、active 切换、失败回退、人工抽样校验。
3. 风险：PDF 解析运行时复杂度高。
   - 控制：P-1 先验证运行方式，未验证前不承诺 PDF 大规模上线。
4. 风险：旧任务覆盖新版本结果。
   - 控制：`targetDocumentVersion`、`superseded`、自动补排新任务。
5. 风险：迁移期行为波动。
   - 控制：按用户 / 知识库灰度，保留向量主路径回退。
6. 风险：LLM token 成本增加。
   - 控制：紧凑工具输出、缓存、短文档路由、预算上限。
7. 风险：旧文档长期停留在旧路径。
   - 控制：批量回填计划与覆盖率监控。

---

## 14. 里程碑判定（Go / No-Go）

满足以下条件再进入“结构化主路径默认开启”：

1. 长文档评测集正确率与引用准确率优于当前基线。
2. `Citation Precision`、`Answer Groundedness` 与 `Fallback Ratio` 达到目标。
3. P95 延迟在产品 SLA 范围内。
4. `Budget Exhaustion Rate`、异常率、超时率可控。
5. `Structured Coverage` 与 `Index Freshness Lag` 达标。
6. 单次查询 token 消耗在预算范围内。
7. 回填与一致性巡检已稳定运行。
