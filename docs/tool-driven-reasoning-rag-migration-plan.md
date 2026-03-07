# Tool-Driven + Context Reasoning RAG 迁移方案（长文本/大文档）

## 1. 背景

当前系统主要基于 `chunk + embedding + vector search`。该方案在通用检索场景有效，但在整本书（PDF）、跨章节引用、长上下文推理场景容易出现：

1. 语义相似但证据不精确（召回偏题）。
2. 固定分块破坏文档结构（章节、小节、附录、图表关系丢失）。
3. 多跳问题需要“章节导航 + 引用跟踪”，仅靠相似度检索不稳定。

目标是升级为：`工具驱动 + 上下文推理` 主路径，向量检索作为兜底能力。

---

## 2. 目标架构（建议采用 Hybrid，逐步演进）

### 2.1 总体原则

1. 不一次性移除向量检索，先做双轨（结构化检索主路径 + 向量兜底）。
2. 检索和推理解耦：先“定位证据”，再“组织回答”。
3. 证据优先：回答必须绑定可追溯引用（章节/页码/节点 ID）。

### 2.2 主流程

1. 用户提问进入 Agent。
2. Agent 先调用结构化工具定位文档节点（目录、章节、引用图）。
3. Agent 读取候选节点原文与上下文邻域，必要时跟踪跨引用。
4. 证据不足时调用向量兜底工具补检。
5. 汇总证据并生成带 citation 的答案。

### 2.3 处理链路（写路径）

1. 上传/编辑/恢复文档后，API 仅入队任务。
2. Worker 异步执行：解析文档结构 -> 构建节点图 -> 可选向量化。
3. 回写文档处理状态与索引版本号。

---

## 3. 数据与索引设计（新增）

建议新增 `document-index` 领域模型（可放在 server modules）：

1. `document_nodes`
   - `id, documentId, nodeType(chapter/section/paragraph/table/figure/appendix), title, pageStart, pageEnd, parentId, orderNo`
2. `document_node_contents`
   - `nodeId, content, contentPreview, tokenCount`
3. `document_edges`
   - `fromNodeId, toNodeId, edgeType(parent/next/refers_to/cites)`
4. `document_index_versions`
   - `documentId, indexVersion, status, error, builtAt`

说明：

1. `document_chunks` 与向量数据先保留，避免迁移期间能力倒退。
2. 结构化索引按版本维护，支持回滚和重建。

---

## 4. 工具设计（Agent Tooling）

建议新增以下工具（主路径）：

1. `outline_search`
   - 输入：`query, documentIds?, kbId?`
   - 输出：匹配章节/小节节点列表（含 nodeId、标题、页码、匹配理由）
2. `node_read`
   - 输入：`nodeIds[], maxTokensPerNode`
   - 输出：节点原文与邻域摘要（上级标题、前后节点）
3. `ref_follow`
   - 输入：`nodeId, depth, edgeTypes`
   - 输出：跨引用链路（如“见附录A/图3-2”）

建议保留以下兜底工具：

1. `vector_fallback_search`
   - 在结构化证据不足时补召回，避免首版召回率下降。

---

## 5. 与现有仓库的改造映射

### 5.1 服务端模块

新增建议：

1. `packages/server/src/modules/document-index/*`
2. `packages/server/src/modules/document-processing-worker/*`（或独立 worker entry）
3. `packages/server/src/modules/agent/tools/outline-search.tool.ts`
4. `packages/server/src/modules/agent/tools/node-read.tool.ts`
5. `packages/server/src/modules/agent/tools/ref-follow.tool.ts`

改造建议：

1. `packages/server/src/modules/agent/tools/index.ts`
   - 调整 `resolveTools`，优先挂载结构化工具；向量工具降级为 fallback。
2. `packages/server/src/modules/chat/services/chat.service.ts`
   - 增加“证据不足时 fallback”的工具调用策略。
3. `packages/server/src/modules/document/*` 与 `packages/server/src/modules/rag/*`
   - 从“直接处理”改为“入队任务 + Worker 消费”。

### 5.2 配置与密钥

1. 维持 embedding 可配置（既定需求）。
2. LLM 与 Embedding 密钥隔离，不允许 OpenAI/Zhipu key 复用。
3. 配置项归属明确：`llm.*` 与 `embedding.*` 分层，不跨域 fallback。

### 5.3 CI 架构门禁

引入依赖边界检查并阻断回归：

1. 禁止模块循环依赖。
2. 禁止 `routes` 跨模块直接依赖他模块 controller。
3. 禁止 controller 直连 repository（必须经 service）。

---

## 6. 分阶段实施计划

### P0（1-2 周）：最小可用 Hybrid

1. 建立 `document-index` 基础表与读写仓储。
2. 实现 `outline_search + node_read` 两个工具。
3. Chat 主链路优先结构化工具，保留向量 fallback。
4. API 写路径改为入队，Worker 最小闭环可跑通。

交付标准：

1. 长文档问答可返回稳定章节级 citation。
2. 与现网相比，准确率不下降且可解释性提升。

### P1（1-2 周）：跨引用能力

1. 实现 `ref_follow` 与引用边构建。
2. 增加跨章节问题模板评测集。
3. 优化 Agent 工具调用策略（减少无效调用）。

### P2（1-2 周）：质量与性能收敛

1. 建立离线评测与线上观测（成功率、延迟、工具调用次数）。
2. 优化 Worker 并发、重试、死信。
3. 对高频文档节点做缓存。

### P3：按指标决定是否弱化向量主路径

1. 仅当结构化主路径在核心指标持续达标，再降低向量依赖权重。
2. 保留可开关的回退策略。

---

## 7. 评测与验收指标

建议至少覆盖以下指标：

1. `Answer Groundedness`：回答句子可被证据节点支持的比例。
2. `Citation Precision`：引用是否指向正确章节/页码。
3. `Multi-hop Success Rate`：跨章节/附录问题正确率。
4. `P95 Latency`：长文档问答端到端时延。
5. `Fallback Ratio`：进入向量兜底的请求比例（越低越好，但不能牺牲质量）。

---

## 8. 风险与控制

1. 风险：工具链变长导致延迟上升。
   - 控制：限制每轮工具预算，超预算直接进入 fallback。
2. 风险：结构化索引质量不稳定（PDF 解析误差）。
   - 控制：索引版本化、失败重建、人工抽样校验。
3. 风险：迁移期行为波动。
   - 控制：灰度开关（按用户/知识库开启），支持一键回退。

---

## 9. 里程碑判定（Go / No-Go）

满足以下条件再进入“结构化主路径默认开启”：

1. 长文档评测集的正确率与引用准确率均优于当前基线。
2. P95 延迟在可接受范围内（由产品 SLA 定义）。
3. 线上异常率、超时率、回退率稳定。
4. CI 架构边界检查稳定执行，无新增循环依赖。
