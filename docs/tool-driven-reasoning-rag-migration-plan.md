# Tool-Driven + Context Reasoning RAG 迁移方案（长文本/大文档）

## 1. 背景

当前系统主要基于 `chunk + embedding + vector search`。该方案在通用检索场景有效，但在整本书（PDF）、跨章节引用、长上下文推理场景容易出现：

1. 语义相似但证据不精确（召回偏题）。
2. 固定分块破坏文档结构（章节、小节、附录、图表关系丢失）。
3. 多跳问题需要"章节导航 + 引用跟踪"，仅靠相似度检索不稳定。

目标是升级为：`工具驱动 + 上下文推理` 主路径，向量检索作为兜底能力。

---

## 2. 目标架构（建议采用 Hybrid，逐步演进）

### 2.1 总体原则

1. 不一次性移除向量检索，先做双轨（结构化检索主路径 + 向量兜底）。
2. 检索和推理解耦：先"定位证据"，再"组织回答"。
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

## 3. 文档结构解析策略

### 3.1 按文档类型的解析方案

| 文档类型         | 解析方案                                    | 说明                                                     |
| ---------------- | ------------------------------------------- | -------------------------------------------------------- |
| **Markdown**     | 原生 heading 解析（`#` ~ `######`）         | 直接按 heading 层级构建节点树，准确率最高                |
| **DOCX**         | heading style 解析（Heading 1 ~ Heading 6） | 读取 `w:pStyle` 属性识别标题层级，正文归属最近的上级标题 |
| **PDF**          | 分层策略：marker/docling + LLM 兜底         | 见 §3.2                                                  |
| **TXT / 纯文本** | 启发式分段（空行 + 行首模式匹配）           | 尝试识别"第X章"等模式，无法识别时整文档作为单节点        |

### 3.2 PDF 结构解析分层策略

PDF 是结构解析难度最高的格式，采用分层降级方案：

1. **首选：marker（开源 PDF 解析库）**
   - 基于视觉布局与字体大小推断标题层级
   - 适合排版规范的书籍、论文、技术文档
   - 输出 Markdown 格式，可直接复用 Markdown 解析逻辑

2. **备选：docling**
   - 对学术论文、双栏排版有更好支持
   - 可根据 P-1 验证阶段的对比结果决定是否引入

3. **兜底：LLM 辅助结构推断**
   - 当 marker/docling 解析结果置信度低（标题层级缺失率 >30%）时触发
   - 将文档前 N 页发送给 LLM，提取目录结构
   - 仅用于补充缺失的标题层级，不替代全文解析

### 3.3 解析质量下限与回退机制

- **最低要求**：至少识别出文档的一级标题（章/节），否则视为解析失败
- **回退策略**：解析失败时降级为传统 chunk 模式（复用现有 `rag` 模块能力），确保不出现"文档上传成功但无法检索"的情况
- **质量指标**：记录每篇文档的 `parseMethod`（structured / chunked）和 `headingCount`，用于后续质量分析

### 3.4 文档路由策略

根据文档长度选择不同处理路径，避免对短文档做不必要的结构化开销：

| 文档长度                     | 处理路径        | 理由                               |
| ---------------------------- | --------------- | ---------------------------------- |
| **短文档**（< 5,000 tokens） | 传统 chunk 路径 | 结构化收益低，chunk 检索已足够精确 |
| **长文档**（≥ 5,000 tokens） | 结构化解析路径  | 章节导航与跨引用价值显著           |

- token 计数使用与 embedding 相同的 tokenizer，确保阈值一致
- 路由决策在 Worker 入口处执行，对下游透明

---

## 4. 数据与索引设计

建议新增 `document-index` 领域模型（可放在 server modules）：

1. `document_nodes`
   - `id, documentId, nodeType(chapter/section/paragraph/table/figure/appendix), title, depth, pageStart, pageEnd, parentId, orderNo, tokenCount`
   - `depth`：节点在文档树中的层级（root=0, chapter=1, section=2, ...），用于高效层级查询和 BFS 遍历
   - `tokenCount`：节点内容的 token 数，用于 Agent 工具调用时的上下文窗口预算控制
2. `document_node_contents`
   - `nodeId, content, contentPreview, tokenCount`
3. `document_edges`
   - `fromNodeId, toNodeId, edgeType(parent/next/refers_to/cites)`
   - **P0 范围**：仅构建 `parent` 和 `next` 两种边类型，满足基本的层级导航和顺序阅读需求
   - **P1 扩展**：`refers_to`（如"见附录A"）和 `cites`（引用关系）延至 P1 阶段，需要 NLP/正则提取引用锚点
4. `document_index_versions`
   - `documentId, indexVersion, status, error, builtAt`

说明：

1. `document_chunks` 与向量数据先保留，避免迁移期间能力倒退。
2. 结构化索引按版本维护，支持回滚和重建。

### 4.1 索引更新策略

采用**全量重建**策略（与现有 chunk 系统一致）：

- 文档更新时，Worker 重新解析并构建完整节点图，替换旧版本索引
- 通过 `document_index_versions` 管理版本切换，旧版本保留一段时间后清理
- 不采用增量更新，原因：文档结构变更可能导致节点 ID 和边关系大面积变化，增量 diff 的复杂度远超全量重建

### 4.2 图遍历性能约束

- `ref_follow` 工具的 `maxDepth` 上限为 3，防止深层遍历导致延迟失控
- 遍历采用应用层 BFS（非数据库递归 CTE），每层批量查询边表
- 单次遍历返回的节点总数上限为 20，超出时按 `orderNo` 截断并提示 Agent 缩小范围

---

## 5. 工具设计（Agent Tooling）

建议新增以下工具（主路径）：

1. `outline_search`
   - 输入：`query, documentIds?, kbId?, includeContentPreview?`
   - 输出：匹配章节/小节节点列表（含 nodeId、标题、页码、匹配分数、匹配理由）
   - **匹配机制**：双路召回 + 合并排序
     - **向量路径**：将 query 编码后与节点 title 向量进行相似度检索（复用现有 embedding 能力）
     - **关键词路径**：BM25 关键词匹配，覆盖精确术语命中场景（如"附录A"、"表3.2"）
     - **合并排序**：RRF（Reciprocal Rank Fusion）合并两路结果，取 top-K（默认 K=10）
   - **`includeContentPreview`**：当设为 `true` 时，返回结果中包含每个节点的 `contentPreview`（前 200 tokens），减少后续 `node_read` 调用次数，适用于 Agent 需要快速判断节点相关性的场景
2. `node_read`
   - 输入：`nodeIds[], maxTokensPerNode`
   - 输出：节点原文与邻域摘要（上级标题、前后节点）
3. `ref_follow`
   - 输入：`nodeId, depth?, edgeTypes?`
   - 输出：跨引用链路（如"见附录A/图3-2"）
   - **`depth`**：默认值 2，最大值 3；超过上限时工具返回截断提示而非报错
   - 遵循 §4.2 中的图遍历性能约束

建议保留以下兜底工具：

1. `vector_fallback_search`
   - 在结构化证据不足时补召回，避免首版召回率下降。

### 5.1 Agent 工具调用预算策略

为控制延迟和 token 消耗，对 Agent 工具调用设置分层预算：

| 工具类别                                                    | 最大调用轮数 | 说明                                                    |
| ----------------------------------------------------------- | ------------ | ------------------------------------------------------- |
| 结构化工具（`outline_search` + `node_read` + `ref_follow`） | ≤ 3 轮       | 覆盖"定位 → 阅读 → 跟踪引用"典型链路                    |
| 向量兜底（`vector_fallback_search`）                        | ≤ 1 轮       | 仅在结构化证据不足时触发                                |
| **总预算**                                                  | **≤ 5 轮**   | 含所有工具调用；超预算后 Agent 必须基于已有证据生成回答 |

- 预算通过 `agentConfig.maxToolRounds`（结构化）和 `agentConfig.maxFallbackRounds`（兜底）配置
- 超预算时 Agent 收到系统提示："工具调用预算已用尽，请基于已收集的证据回答"
- 该策略确保单次查询的 P95 延迟可控（目标 < 15s）

---

## 6. 与现有仓库的改造映射

### 6.1 服务端模块

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
   - 增加"证据不足时 fallback"的工具调用策略。
3. `packages/server/src/modules/document/*` 与 `packages/server/src/modules/rag/*`
   - 从"直接处理"改为"入队任务 + Worker 消费"。

### 6.2 配置与密钥

1. 维持 embedding 可配置（既定需求）。
2. LLM 与 Embedding 密钥隔离，不允许 OpenAI/Zhipu key 复用。
3. 配置项归属明确：`llm.*` 与 `embedding.*` 分层，不跨域 fallback。

### 6.3 CI 架构门禁

> **注意**：CI 架构门禁作为独立 issue 单独跟踪，不纳入本次 RAG 迁移范围。

引入依赖边界检查并阻断回归（独立实施）：

1. 禁止模块循环依赖。
2. 禁止 `routes` 跨模块直接依赖他模块 controller。
3. 禁止 controller 直连 repository（必须经 service）。

---

## 7. 分阶段实施计划

### P-1（1 周）：技术验证

在正式开发前，先用最小成本验证关键技术选型风险：

1. **PDF 结构解析选型验证**
   - 准备 3-5 个典型文档（技术文档 PDF、学术论文 PDF、纯文本手册、Markdown 长文档）
   - 分别使用 marker 和 docling 解析，对比标题识别率、层级准确率、解析耗时
   - 产出选型结论和各类型文档的解析质量报告
2. **最小闭环跑通**
   - 手动构建 1 篇文档的节点图（可用脚本辅助）
   - 实现 `outline_search`（仅 title 关键词匹配，不含向量路径）+ `node_read` 的 MVP
   - 验证 Agent 能否基于结构化工具完成一次完整的问答链路
3. **产出 P0 细化计划**
   - 根据验证结果调整 §3 的解析方案和 §5 的工具设计细节

交付标准：

1. 有明确的 PDF 解析技术选型结论（附对比数据）。
2. 至少 1 篇文档可跑通"上传 → 结构化解析 → outline_search → node_read → 回答"全链路。

### P0（2-3 周）：最小可用 Hybrid

1. 建立 `document-index` 基础表与读写仓储。
2. 实现文档结构解析 Worker（Markdown / DOCX / PDF），含短文档路由逻辑。
3. 实现 `outline_search`（双路召回）+ `node_read` 两个工具。
4. `document_edges` 仅构建 `parent` 和 `next` 边类型。
5. Chat 主链路优先结构化工具，保留向量 fallback。
6. API 写路径改为入队，Worker 最小闭环可跑通。

交付标准：

1. 长文档问答可返回稳定章节级 citation。
2. 与现网相比，准确率不下降且可解释性提升。
3. 短文档（< 5,000 tokens）自动走 chunk 路径，无行为变化。

### P1（1-2 周）：跨引用能力

1. 实现 `ref_follow` 与引用边构建（`refers_to`/`cites` 边类型）。
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

## 8. 评测与验收指标

建议至少覆盖以下指标：

1. `Answer Groundedness`：回答句子可被证据节点支持的比例。
2. `Citation Precision`：引用是否指向正确章节/页码。
3. `Multi-hop Success Rate`：跨章节/附录问题正确率。
4. `P95 Latency`：长文档问答端到端时延。
5. `Fallback Ratio`：进入向量兜底的请求比例（越低越好，但不能牺牲质量）。

---

## 9. 成本评估

### 9.1 每次查询的额外 LLM token 消耗

工具驱动方案相比纯向量检索，每次查询会产生额外的 LLM token 消耗：

| 阶段                      | 估算 token 消耗         | 说明                                   |
| ------------------------- | ----------------------- | -------------------------------------- |
| 工具调用决策（每轮）      | ~500 tokens             | Agent 分析当前状态并选择工具           |
| `outline_search` 结果解析 | ~300 tokens             | 返回 top-10 节点标题与匹配分数         |
| `node_read` 内容消费      | ~1,000-3,000 tokens     | 取决于 `maxTokensPerNode` 和读取节点数 |
| `ref_follow` 链路解析     | ~500 tokens             | 返回关联节点的标题和关系类型           |
| **单次查询总额外消耗**    | **~2,500-5,000 tokens** | 相比纯向量检索的 ~1,000-2,000 tokens   |

### 9.2 与纯向量检索方案的成本对比

| 维度             | 纯向量检索    | 工具驱动方案                               | 差异         |
| ---------------- | ------------- | ------------------------------------------ | ------------ |
| LLM token / 查询 | ~1,000-2,000  | ~3,500-7,000                               | +2.5x ~ 3.5x |
| embedding 调用   | 每次查询 1 次 | 每次查询 1-2 次（outline_search 向量路径） | +0 ~ 1 次    |
| 数据库查询       | 1 次向量搜索  | 3-5 次关系查询                             | 增加 DB 负载 |
| 端到端延迟       | ~2-5s         | ~5-15s                                     | +2x ~ 3x     |

### 9.3 成本优化建议

1. **缓存高频节点摘要**：对频繁被检索的文档节点（如目录、核心章节），缓存 `contentPreview`，减少 `node_read` 调用
2. **合并工具调用**：`outline_search` 启用 `includeContentPreview` 后，Agent 可在一轮内完成"定位 + 初筛"，减少 1 轮工具调用
3. **短文档走 chunk 路径**：< 5,000 tokens 的文档不走结构化路径，避免不必要的额外消耗
4. **按需加载 `ref_follow`**：仅在 Agent 判断存在跨引用需求时调用，大部分查询可在 2 轮内完成

---

## 10. 风险与控制

1. 风险：工具链变长导致延迟上升。
   - 控制：限制每轮工具预算（§5.1），超预算直接进入 fallback。
2. 风险：结构化索引质量不稳定（PDF 解析误差）。
   - 控制：索引版本化、失败重建、人工抽样校验。
3. 风险：迁移期行为波动。
   - 控制：灰度开关（按用户/知识库开启），支持一键回退。
4. 风险：PDF 解析质量不可控。
   - 控制：P-1 阶段提前验证选型（§7），解析失败时回退到传统 chunk 模式（§3.3），记录 `parseMethod` 持续监控结构化覆盖率。
5. 风险：LLM token 成本增加（单次查询 +2.5x ~ 3.5x）。
   - 控制：实施 §9.3 中的优化措施（缓存、合并调用、短文档路由），设置每用户/知识库的日调用量上限，监控 `tokenUsagePerQuery` 指标。

---

## 11. 里程碑判定（Go / No-Go）

满足以下条件再进入"结构化主路径默认开启"：

1. 长文档评测集的正确率与引用准确率均优于当前基线。
2. P95 延迟在可接受范围内（由产品 SLA 定义）。
3. 线上异常率、超时率、回退率稳定。
4. 单次查询 token 消耗在预算范围内（见 §9）。
