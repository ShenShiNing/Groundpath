# Tool-Driven + Context Reasoning RAG 执行清单与 Issue Backlog

> 配套文档：`docs/tool-driven-reasoning-rag-migration-plan.md`
> 文件落点清单：`docs/tool-driven-reasoning-rag-file-task-list.md`
> 文档状态：截至 `2026-03-10` 已按仓库代码审计结果更新。
>
> 用途：
>
> 1. 作为 implementation checklist 逐项执行
> 2. 作为 issue backlog 来源，直接拆到项目管理工具
> 3. 作为阶段验收和依赖检查清单

## 1. 使用方式

推荐执行顺序：

1. 先完成 `P-1`
2. 再完成 `P0-A`
3. 确认契约、版本切换、任务新鲜度稳定后，再做 `P0-B`
4. `P1 / P2 / P3` 只在前一阶段验收通过后推进

建议每个 issue 至少包含：

1. 背景
2. 目标
3. 非目标
4. 实现范围
5. 验收标准
6. 风险与回滚方式

---

## 1.1 当前状态

截至 `2026-03-10` 的实际进度（基于代码审计）：

1. `P-1` 大体完成，仅剩 **最终沉淀文档**（节点图验证产物、MVP token/延迟模板）。PDF 运行时选型已收口：统一采用 docling（marker/pdf-parse 结构化运行时已移除）。
2. `P0-A` 已完成。
3. `P0-B` 大体完成，剩余 **evidence selection 优化**（当前 `finalizeCitations` 仅做 key 去重 + score 截断，缺多样性/冗余过滤/再排序）和 **dedicated e2e / UI 专项测试**（有 4 个 smoke e2e + 完整单元/集成覆盖，但无 Playwright/Cypress 浏览器自动化、无全链路 Chat→Search→Read→Follow e2e）。
4. `P1` 部分完成。`refers_to / cites` 边、`ref_follow`、检索材料增强已落地；剩余 **caption 清洗补强**、**跨章节评测集**、**evidence selection 深度优化**。
5. `P2` 已启动。backfill service/CLI、结构化观测/报表/邮件告警、多级缓存已落地；剩余 **回填持久化进度统计**（当前仅日志，无进度 API/断点续传）、**Worker 并发调优**（参数已可配但未做负载测试）、**死信处理策略**（BullMQ 保留失败 job 但无独立 DLQ/查询 API/告警入口）、**缓存收益量化**。
6. `P3` Go/No-Go 全部未开始。
7. 额外能力：**VLM 图片描述**已在 PDF 解析链路中落地（provider-agnostic VLM pipeline + 图片分类 + type-aware prompt），作为 P1 图表解析增强的延伸。

## 2. 实施总 Checklist

### 2.1 P-1 技术验证 Checklist

- [x] 确定 PDF 解析运行方式：统一采用 `docling`（marker/pdf-parse 结构化运行时已移除；docling 3/3 成功 avg 13.3s）
- [x] 准备 3-5 个典型文档样本（`quick` 样本集已准备并用于对比）
- [x] 对 `marker` 做解析质量与耗时验证（结论：marker 不稳定，2/3 失败，已决定放弃；统一 docling）
- [x] 对 `docling` 做解析质量与耗时验证（`quick` 样本集已跑通 3/3 成功，avg 13.3s，并沉淀对比脚本/样本/报告）
- [x] 输出解析选型结论与运行时限制（选型结论：docling 为唯一结构化 PDF 运行时；marker/pdf-parse 运行时代码已清理）
- [x] 产出 citation/source 新契约草案
- [x] 产出 `activeIndexVersion` 设计说明
- [x] 产出队列 job payload 扩展草案
- [ ] 手工构建 1 篇文档节点图沉淀为验证产物（当前有 3 个 docling fixture 和集成测试覆盖，但缺少作为独立交付物的可视化节点图）
- [x] 实现 `outline_search` 关键词版 MVP
- [x] 实现 `node_read` MVP
- [x] 跑通单文档结构化问答闭环
- [ ] 记录一次完整 MVP 的 token / 延迟 / citation 样例（当前已有 `quick` 对比耗时，仍缺最终沉淀模板）

### 2.2 P0-A 基础契约与一致性 Checklist

- [x] 新增 `document_index_versions` 表
- [x] 新增 `document_nodes` 表
- [x] 新增 `document_node_contents` 表
- [x] 新增 `document_edges` 表
- [x] 定义 active version 唯一性约束（通过 `documents.activeIndexVersionId` 指针语义实现）
- [x] 扩展 shared `Citation` 类型，支持 `sourceType=node`
- [x] 扩展消息 metadata，支持 `retrievedSources / finalCitations / stopReason`
- [x] 扩展 SSE `sources` 事件负载
- [x] 调整客户端 citation 展示结构
- [x] 扩展队列 job payload，加入 `targetDocumentVersion / targetIndexVersion / reason`
- [x] Worker 增加任务新鲜度检查
- [x] Worker 增加 `superseded` 处理逻辑
- [x] Worker 增加 active version 激活步骤
- [x] 增加索引状态错误分类与日志字段
- [x] 增加结构化索引一致性检查脚本
- [x] 增加 stale building / failed index backlog 巡检
- [x] 增加 orphan nodes / orphan edges 巡检
- [x] 增加 active version mismatch 巡检

### 2.3 P0-B 最小可用 Hybrid Checklist

- [x] Worker 增加短文档 / 长文档路由逻辑
- [x] 实现 Markdown 结构化解析
- [x] 实现 DOCX 结构化解析
- [x] 实现 PDF 结构化解析首版
- [x] 解析失败时自动回退到 chunk 路径
- [x] 实现 `outline_search` 正式版
- [x] 实现 `node_read` 正式版
- [x] 实现 `vector_fallback_search`
- [x] `resolveTools` 改为结构化工具优先
- [x] executor 增加 `structuredRounds / fallbackRounds / totalRounds`（`totalRounds` 当前由 `maxIterations` 覆盖）
- [x] executor 增加 `stopReason`
- [ ] executor 增加 citation 去重与 evidence selection（当前 `finalizeCitations()` 已实现基于 `documentId:nodeId/chunkIndex` 的 key 去重、按 score 降序保留最高分、上限 8 条截断；`finalizeStopReason()` 可检测 `insufficient_evidence`；仍缺跨文档多样性过滤、冗余检测、相关性再排序等深度 evidence selection）
- [x] streaming 聊天链路切到统一编排
- [x] non-streaming 聊天链路切到统一编排
- [x] 为结构化链路增加 feature flag
- [x] 支持按用户 / 知识库灰度
- [ ] 补齐最小端到端测试（当前已有：4 个 smoke e2e（auth/chat/kb/trash）、13 个 document-index 单元测试、3 个 agent 工具测试（outline-search/node-read/ref-follow）、1 个 docling 全链路集成测试、shared citation schema 测试、client citation store 测试；仍缺：Playwright/Cypress 浏览器自动化、Chat→Search→Read→Follow 全链路 e2e、Qdrant 真实集成测试、LLM 响应流 e2e）

### 2.4 P1 跨引用与质量增强 Checklist

- [x] 新增 `refers_to / cites` 边类型
- [x] 实现 `ref_follow`
- [ ] 解析图表 / 附录 / 引用锚点（当前已支持：`front matter` 标注与搜索降权、`table / figure / appendix` 子节点类型（`ParsedNodeType`）、`refers_to / cites` 边自动抽取（中英文 pattern）、`isFigureCaptionBlock()` caption 检测、docling normalizer 中 `Figure 2 - 1` 连字修复、VLM 图片描述已接入 PDF figure 节点；仍需补强：复杂嵌套表格解析、caption pattern 覆盖面扩展、图表内容语义提取）
- [x] 检索材料纳入 `sectionPath / parent titles / alias anchors / contentPreview`
- [ ] 增加跨章节 / 附录 / 图表评测集（当前有 3 个 fixture：book-nist-snippet / paper-attention-snippet / synthetic-chart-snippet，集成测试覆盖了 figure 搜索、ref_follow 边遍历、front matter 降权；仍缺独立量化评测数据集与 precision/recall/latency 指标）
- [ ] 优化 evidence selection 与 citation 收口（同 P0-B executor evidence selection，当前为简单 key 去重 + score 截断，未正式启动深度优化）

### 2.5 P2 回填与性能 Checklist

- [x] 设计旧文档批量回填任务
- [x] 增加回填并发与速率限制（`BACKFILL_BATCH_SIZE=100`、`BACKFILL_ENQUEUE_DELAY_MS=0` 可配、复用 `QUEUE_CONCURRENCY=3` + `QUEUE_MAX_RETRIES=3` + exponential backoff）
- [ ] 建立回填进度统计（当前 backfill CLI 支持 `--dry-run` / 按 KB/类型过滤 / 分页，但进度仅在日志中；无持久化进度表、无实时进度 API、无断点续传，需手动传 `--offset` 继续）
- [x] 增加高频节点缓存（已完成 `outline_search` / `node_read` / 单节点读取缓存，并补了 preview 热点缓存）
- [x] 增加目录节点缓存（已通过 `indexVersionId -> node list` 缓存落地）
- [ ] 优化 Worker 并发与重试参数（当前参数已可通过环境变量配置：`QUEUE_CONCURRENCY=3`、`QUEUE_MAX_RETRIES=3`、`QUEUE_BACKOFF_DELAY=5000`、`QUEUE_BACKOFF_TYPE=exponential`；仍缺负载测试调优结论、不同文档类型差异化重试策略）
- [ ] 增加死信处理策略（当前 BullMQ `removeOnFail: { count: 5000 }` 保留失败 job、日志区分 retryable/permanent failure；仍缺独立死信队列、失败 job 查询 API、自动告警与人工审核入口）
- [x] 增加结构化链路观测面板（summary API + dashboard v1 已落地）
- [x] 增加预算耗尽率与 fallback ratio 监控（当前已可通过 summary API / dashboard v1 查询）

### 2.6 P3 默认开启前 Checklist

- [ ] 长文档评测集准确率优于现网基线
- [ ] citation precision 达标
- [ ] groundedness 达标
- [ ] P95 latency 达标
- [ ] fallback ratio 稳定
- [ ] budget exhaustion rate 可控
- [ ] structured coverage 达标
- [ ] index freshness lag 达标
- [ ] 灰度期间异常率稳定
- [ ] 一键回退策略演练通过

---

## 3. Issue Backlog 结构建议

建议按照以下层级建 issue：

1. `Epic`
   - 对应阶段目标，如 `P0-A 基础契约与一致性`
2. `Feature`
   - 对应一组可发布能力，如 `结构化 citation 契约`
3. `Task`
   - 对应单一实现项，如 `扩展 packages/shared/src/types/chat.ts`

推荐标签：

1. `area/server`
2. `area/client`
3. `area/shared`
4. `area/infra`
5. `phase/p-1`
6. `phase/p0-a`
7. `phase/p0-b`
8. `phase/p1`
9. `phase/p2`
10. `phase/p3`
11. `risk/high`
12. `needs-migration`

---

## 4. Epic Backlog

### Epic 1: P-1 技术验证与方案定稿

目标：
在不大规模改动现有链路的前提下，验证结构化 RAG 的运行时可行性、契约边界和最小闭环。

完成定义：

1. PDF 解析方案有明确选型结论
2. citation/source 契约有明确草案
3. active version 与任务新鲜度方案明确
4. MVP 闭环可跑通

### Epic 2: P0-A 基础契约与一致性

目标：
让结构化索引具备“可写入、可切换、可回滚、可观测”的最低基础。

完成定义：

1. 新索引表结构上线
2. SSE / metadata / shared types 支持节点级 citation
3. Worker 支持 active version / superseded
4. 巡检脚本可发现核心结构化索引异常

### Epic 3: P0-B 最小可用 Hybrid 主链路

目标：
让长文档问答正式走“结构化优先 + 向量兜底”。

完成定义：

1. 长文档可返回章节级 citation
2. streaming 与 non-streaming 行为一致
3. 解析失败不影响文档可检索性
4. 灰度开关可控

### Epic 4: P1 跨引用与质量增强

目标：
补齐多跳与跨引用能力，提高长文档复杂问题命中率。

### Epic 5: P2 回填与性能收敛

目标：
提升结构化索引覆盖率并把性能、成本、异常率收敛到可接受范围。

### Epic 6: P3 默认开启与向量主路径弱化

目标：
在指标持续稳定后，将结构化主路径默认开启。

---

## 5. 详细 Issue Backlog

### 5.0 当前 Issue 状态总览

| Issue | 状态     | 备注                                                                                                                                                                                                                            |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | 已完成   | 选型结论：统一 docling；marker/pdf-parse 结构化运行时代码已清理                                                                                                                                                                 |
| 2     | 已完成   | citation / source 契约已落地                                                                                                                                                                                                    |
| 3     | 已完成   | active version / freshness / superseded 已落地                                                                                                                                                                                  |
| 4     | 已完成   | 结构化 MVP 闭环已可运行                                                                                                                                                                                                         |
| 5     | 已完成   | schema + migration 已落地                                                                                                                                                                                                       |
| 6     | 已完成   | shared / metadata / SSE 契约已落地                                                                                                                                                                                              |
| 7     | 已完成   | client 节点级 citation 展示已落地                                                                                                                                                                                               |
| 8     | 已完成   | 队列 payload 与 Worker 状态机已落地                                                                                                                                                                                             |
| 9     | 已完成   | `db:check` 已扩展结构化巡检                                                                                                                                                                                                     |
| 10    | 已完成   | Worker 路由与结构化解析入口已落地                                                                                                                                                                                               |
| 11    | 已完成   | Markdown / DOCX / PDF 首版解析已落地；VLM 图片描述已接入 PDF figure 节点                                                                                                                                                        |
| 12    | 已完成   | `outline_search` 已落地（含 front matter 降权、alias anchors、sectionPath）                                                                                                                                                     |
| 13    | 已完成   | `node_read` 已落地（含 truncation、邻域引用、token 控制）                                                                                                                                                                       |
| 14    | 已完成   | `vector_fallback_search` 已落地                                                                                                                                                                                                 |
| 15    | 已完成   | 预算与 `stopReason` 已落地（`maxStructuredRounds=3`、`maxFallbackRounds=1`、6 种 stop reason）                                                                                                                                  |
| 16    | 已完成   | streaming / non-streaming 编排已统一                                                                                                                                                                                            |
| 17    | 已完成   | feature flag + internal allowlist 灰度已落地                                                                                                                                                                                    |
| 18    | 部分完成 | 已有 4 个 smoke e2e、13 个 document-index 单元测试、3 个 agent 工具测试、1 个 docling 全链路集成测试、citation schema/store 测试；仍缺 Playwright/Cypress 浏览器自动化、全链路 Chat→Search→Read→Follow e2e、Qdrant 真实集成测试 |
| 19    | 已完成   | 引用边与 `ref_follow` 已落地（BFS 遍历、深度/节点数限制、`refers_to / cites` 边）                                                                                                                                               |
| 20    | 已完成   | 检索材料增强首版已落地，并补了 `front matter` 降权、`table / figure / appendix` 子节点、VLM imageDescription 富化、更细粒度 citation excerpt                                                                                    |
| 21    | 部分完成 | backfill service / CLI 已落地（`--dry-run` / KB 过滤 / 类型过滤 / 分页），仍缺持久化进度表、实时进度 API、断点续传                                                                                                              |
| 22    | 部分完成 | summary API、dashboard v4、长期报表导出、邮件外部告警与基础告警治理已落地；归档与多渠道外发未实现                                                                                                                               |
| 23    | 部分完成 | `outline_search` / `node_read` / 单节点读取 / `indexVersionId -> nodes` 缓存、preview 热点缓存、写路径精细失效、executor 级结果复用已落地；收益量化与更强 selective invalidation 未实现                                         |
| 24    | 未开始   | Go / No-Go 评估未开始                                                                                                                                                                                                           |

### P-1 / Issue 1: 验证 PDF 解析运行时方案

类型：`Feature`

建议标题：
`spike(rag): validate pdf parser runtime for structured indexing`

范围：

1. 评估 `marker`（结论：不稳定，2/3 失败，已放弃）
2. 评估 `docling`（已完成：3/3 成功，avg 13.3s）
3. 明确运行方式与资源限制（统一 docling，配置项：`DOCUMENT_INDEX_PDF_TIMEOUT` / `DOCUMENT_INDEX_PDF_CONCURRENCY`）

交付物：

1. 样本文档清单（已有：book-nist-ai-600-1、paper-attention-2017、synthetic-chart-dense-report）
2. 解析质量对比表（已有 `.cache/structured-rag/pdf-runtime-compare/latest.md`）
3. 运行时方案结论（已完成：统一 docling，marker/pdf-parse 结构化运行时已清理）

验收标准：

1. 至少 3 类 PDF 样本完成对比
2. 输出耗时、成功率、主要失败类型
3. 给出推荐运行方式与失败回退策略

依赖：

1. 无

### P-1 / Issue 2: 设计结构化 citation/source 契约

类型：`Feature`

建议标题：
`design(shared): define structured citation contract for node-based evidence`

范围：

1. 定义 `sourceType=node/chunk`
2. 定义 `nodeId / indexVersion / sectionPath / locator / excerpt`
3. 明确 SSE 与 metadata 兼容策略

交付物：

1. 字段设计表
2. JSON 样例
3. 前端展示约束说明

验收标准：

1. shared / server / client 三端都能消费该契约
2. 旧 chunk citation 有明确兼容策略

依赖：

1. 无

### P-1 / Issue 3: 设计 active index version 与任务新鲜度机制

类型：`Feature`

建议标题：
`design(server): define active index version and job freshness semantics`

范围：

1. 定义 active 版本切换规则
2. 定义 superseded 规则
3. 定义 job payload 扩展

交付物：

1. 状态流转图
2. job payload 草案
3. 激活 / 回滚规则

验收标准：

1. 说明旧任务如何不覆盖新版本结果
2. 说明何时激活、何时 supersede、何时补排新任务

依赖：

1. 无

### P-1 / Issue 4: 跑通结构化问答 MVP

类型：`Task`

建议标题：
`spike(agent): prove outline_search + node_read single-document flow`

范围：

1. 手工构建一篇文档节点图
2. 做关键词版 `outline_search`
3. 做最小 `node_read`

验收标准：

1. 能回答至少 3 个章节定位问题
2. 返回结构化 citation 样例
3. 有 token 和延迟记录

依赖：

1. Issue 2

### P0-A / Issue 5: 新增结构化索引表与迁移

类型：`Feature`

建议标题：
`feat(server): add document index tables and versioning schema`

范围：

1. 新增索引版本表
2. 新增节点表
3. 新增节点内容表
4. 新增边表

验收标准：

1. migration 可执行
2. 索引表具备必要索引与唯一性约束
3. active version 语义可表达

依赖：

1. Issue 3

### P0-A / Issue 6: 升级 shared citation 与消息 metadata

类型：`Feature`

建议标题：
`feat(shared): support structured citations in chat contracts`

范围：

1. 扩展 `Citation`
2. 扩展 `MessageMetadata`
3. 扩展 SSE `sources`

验收标准：

1. 类型编译通过
2. 旧 chunk citation 仍可消费
3. 节点级 citation 有类型保护

依赖：

1. Issue 2

### P0-A / Issue 7: 客户端支持节点级 citation 展示

类型：`Feature`

建议标题：
`feat(client): render structured citations with section path and page locator`

范围：

1. 渲染 `sectionPath`
2. 渲染页码区间
3. 渲染 excerpt / locator

验收标准：

1. 旧 citation 展示不回归
2. 新 citation 可读性合格
3. 流式 sources 与历史消息展示一致

依赖：

1. Issue 6

### P0-A / Issue 8: 扩展队列 payload 与 Worker 状态机

类型：`Feature`

建议标题：
`feat(server): add targetDocumentVersion and superseded handling to document processing jobs`

范围：

1. 扩展 job payload
2. 增加任务新鲜度校验
3. 增加 `superseded` 状态
4. 增加 active 激活逻辑

验收标准：

1. 文档版本前进时旧任务不会覆盖新索引
2. 重试逻辑不破坏 active 版本
3. 日志包含版本与 job 信息

依赖：

1. Issue 3
2. Issue 5

### P0-A / Issue 9: 扩展结构化索引巡检脚本

类型：`Task`

建议标题：
`feat(server): add structured index consistency checks`

范围：

1. orphan nodes
2. orphan edges
3. active version mismatch
4. stale building backlog

验收标准：

1. `db:check` 能发现结构化索引核心问题
2. 输出明确问题明细

依赖：

1. Issue 5

### P0-B / Issue 10: Worker 增加路由逻辑与结构化解析入口

类型：`Feature`

建议标题：
`feat(server): route long documents to structured indexing pipeline`

范围：

1. 短文档保留 chunk 路径
2. 长文档走结构化路径
3. 记录 route mode 与 parse metrics

验收标准：

1. 路由阈值可配置
2. 失败时能自动回退 chunk

依赖：

1. Issue 5
2. Issue 8

### P0-B / Issue 11: 实现 Markdown / DOCX / PDF 结构化解析器

类型：`Feature`

建议标题：
`feat(server): implement structured parsers for markdown docx and pdf`

范围：

1. Markdown heading parser
2. DOCX heading parser
3. PDF parser integration

验收标准：

1. 生成节点树
2. 生成页码或 locator 信息
3. 解析失败可回退

依赖：

1. Issue 1
2. Issue 10

### P0-B / Issue 12: 实现 `outline_search`

类型：`Feature`

建议标题：
`feat(agent): add outline_search for structured node retrieval`

范围：

1. 关键词召回
2. 可选向量召回
3. RRF 合并

验收标准：

1. 返回节点级结果
2. 支持 `includeContentPreview`
3. 结果可直接转 citation

依赖：

1. Issue 5
2. Issue 11

### P0-B / Issue 13: 实现 `node_read`

类型：`Feature`

建议标题：
`feat(agent): add node_read for structured content access`

范围：

1. 节点内容读取
2. 邻域信息读取
3. 截断与 token 控制

验收标准：

1. 支持 `maxTokensPerNode`
2. 返回 `truncated` 标记
3. 支持 parent / prev / next 邻域

依赖：

1. Issue 5
2. Issue 11

### P0-B / Issue 14: 实现 `vector_fallback_search`

类型：`Task`

建议标题：
`refactor(agent): separate vector fallback search from primary kb search`

范围：

1. 拆分现有知识库搜索工具语义
2. 改为“结构化优先，向量兜底”

验收标准：

1. fallback 调用受预算控制
2. 无结构化证据时可回退到向量结果

依赖：

1. Issue 12
2. Issue 13

### P0-B / Issue 15: executor 增加预算与 stop reason

类型：`Feature`

建议标题：
`feat(agent): enforce structured tool budget and stop reasons in executor`

范围：

1. `structuredRounds`
2. `fallbackRounds`
3. `totalRounds`
4. `stopReason`

验收标准：

1. 预算在 executor 层强制生效
2. trace 中可看到 stop reason
3. 超预算不会继续盲目调用工具

依赖：

1. Issue 12
2. Issue 13
3. Issue 14

### P0-B / Issue 16: 统一 streaming / non-streaming 聊天编排

类型：`Feature`

建议标题：
`refactor(chat): unify structured rag orchestration across streaming and non-streaming flows`

范围：

1. 统一 tool resolution
2. 统一 citation 组装
3. 统一 fallback 行为

验收标准：

1. 两条链路返回一致的 citation 结构
2. 主要行为只维护一份实现

依赖：

1. Issue 6
2. Issue 12
3. Issue 13
4. Issue 15

### P0-B / Issue 17: 增加灰度开关与回退控制

类型：`Task`

建议标题：
`feat(server): add feature flags for structured rag rollout and rollback`

范围：

1. 用户级灰度
2. 知识库级灰度
3. 一键回退

验收标准：

1. 可按配置动态关闭结构化主路径
2. 关闭后仍可正常走向量路径

依赖：

1. Issue 16

### P0-B / Issue 18: 补齐最小测试矩阵

类型：`Task`

建议标题：
`test(server): add structured rag integration coverage for happy path and rollback path`

范围：

1. 文档上传后结构化索引生成
2. 解析失败回退
3. 旧任务 superseded
4. 聊天返回节点级 citation

已有覆盖：

1. 4 个 smoke e2e（auth / chat / kb-document / trash）—— `tests/e2e/`
2. 13 个 document-index 单元测试（parser / service / search）—— `tests/modules/document-index/`
3. 3 个 agent 工具测试（outline-search / node-read / ref-follow）—— `tests/modules/agent/`
4. 1 个 docling 全链路集成测试（parse → persist → search → read → follow）—— `tests/integration/structured-rag/`
5. shared citation schema 测试 —— `packages/shared/tests/chat/`
6. client citation store 测试 —— `packages/client/tests/stores/`

仍缺：

1. Playwright / Cypress 浏览器自动化测试
2. Chat → outline_search → node_read → ref_follow 全链路 e2e
3. Qdrant 真实集成测试（当前搜索测试全部 mock）
4. LLM 响应流处理 e2e
5. 超时 / 错误恢复场景集成测试

验收标准：

1. 覆盖 happy path
2. 覆盖失败回退
3. 覆盖幂等 / 新鲜度场景

依赖：

1. Issue 8
2. Issue 16

### P1 / Issue 19: 构建引用边并实现 `ref_follow`

类型：`Feature`

建议标题：
`feat(agent): support citation graph traversal with ref_follow`

范围：

1. 引用边抽取
2. `ref_follow` 工具
3. 图遍历限流

验收标准：

1. 支持深度限制
2. 支持截断标记
3. 对附录 / 图表引用有效

依赖：

1. Issue 11
2. Issue 15

### P1 / Issue 20: 增强结构化检索材料

类型：`Task`

建议标题：
`feat(server): enrich node search material with section path aliases and previews`

范围：

1. `sectionPath`
2. alias anchors
3. contentPreview
4. parent titles

验收标准：

1. 泛化标题命中率提升
2. 图表 / 附录类查询命中率提升

依赖：

1. Issue 12

### P2 / Issue 21: 设计并实现旧文档批量回填

类型：`Feature`

建议标题：
`feat(server): add structured index backfill pipeline for existing documents`

范围：

1. 回填任务定义
2. 并发控制
3. 进度统计

已有实现：

1. `documentIndexBackfillService`（`enqueueBackfill()` + `listCandidates()`）
2. CLI 脚本 `pnpm -F @knowledge-agent/server document-index:backfill`（支持 `--kb` / `--document-type` / `--limit` / `--offset` / `--include-indexed` / `--include-processing` / `--dry-run`）
3. 配置：`BACKFILL_BATCH_SIZE=100`、`BACKFILL_ENQUEUE_DELAY_MS=0`
4. 复用队列并发：`QUEUE_CONCURRENCY=3`、`QUEUE_MAX_RETRIES=3`、exponential backoff
5. Job 去重：`doc-{id}-v{version}-idx-{indexVersion}` 避免重复入队

仍缺：

1. 持久化回填进度表（当前进度仅在 `logger.info` 中）
2. 实时进度查询 API
3. 断点续传（需手动传 `--offset`）
4. 回填完成通知 / webhook

验收标准：

1. 可按批次回填
2. 不影响在线主链路
3. 有可观测进度

依赖：

1. Issue 10
2. Issue 11

### P2 / Issue 22: 增加结构化链路观测与面板

类型：`Task`

建议标题：
`feat(observability): add metrics and dashboards for structured rag`

范围：

1. parse success rate
2. structured coverage
3. fallback ratio
4. budget exhaustion rate
5. index freshness lag

验收标准：

1. 指标可查询
2. 有基础 dashboard
3. 有异常阈值建议

依赖：

1. Issue 16

### P2 / Issue 23: 缓存与性能优化

类型：`Task`

建议标题：
`perf(server): cache hot node previews and optimize structured rag latency`

范围：

1. 高频节点摘要缓存
2. 目录节点缓存
3. 工具输出压缩

验收标准：

1. P95 latency 有明显改善
2. token 消耗下降

依赖：

1. Issue 22

### P3 / Issue 24: 评估结构化主路径默认开启

类型：`Feature`

建议标题：
`release(rag): evaluate go/no-go for default structured rag rollout`

范围：

1. 指标复盘
2. 灰度结果复盘
3. 默认开启决策

验收标准：

1. 所有 Go / No-Go 条件有明确结论
2. 回滚策略已演练

依赖：

1. Issue 18
2. Issue 21
3. Issue 22
4. Issue 23

---

## 6. 推荐并行度与依赖关系

### 6.1 可并行项

以下 issue 可以并行：

1. Issue 1 与 Issue 2
2. Issue 2 与客户端展示方案预研
3. Issue 5 与 Issue 6
4. Issue 12 与 Issue 13
5. Issue 21 与 Issue 22

### 6.2 强依赖项

以下 issue 不建议跳过前置：

1. Issue 8 依赖 Issue 3 与 Issue 5
2. Issue 16 依赖 Issue 6、12、13、15
3. Issue 24 依赖回填、观测、测试全部稳定

### 6.3 最小推进路径

如果资源有限，最小推进路径建议为：

1. Issue 1
2. Issue 2
3. Issue 3
4. Issue 4
5. Issue 5
6. Issue 6
7. Issue 8
8. Issue 10
9. Issue 11
10. Issue 12
11. Issue 13
12. Issue 15
13. Issue 16
14. Issue 17
15. Issue 18

---

## 7. 阶段验收模板

每个阶段结束时，建议按以下模板验收：

### 阶段结果

1. 已完成 issue
2. 未完成 issue
3. 阻塞项
4. 风险项

### 指标结果

1. 正确率
2. citation precision
3. groundedness
4. P95 latency
5. fallback ratio
6. budget exhaustion rate

### 决策

1. 继续推进下一阶段
2. 暂停并修复问题
3. 回退到上一阶段策略

---

## 8. 剩余工作优先级建议

按影响面和依赖关系排序的推荐推进顺序：

| 优先级 | 工作项                              | 阶段      | 阻塞关系                       |
| ------ | ----------------------------------- | --------- | ------------------------------ |
| 1      | evidence selection 深度优化         | P0-B / P1 | 影响 citation quality，阻塞 P3 |
| 2      | 回填持久化进度统计                  | P2        | 回填规模化的运营前提           |
| 3      | dedicated e2e / UI 专项测试         | P0-B      | 灰度前的安全网                 |
| 4      | 死信处理策略                        | P2        | 生产环境运维必备               |
| 5      | caption 清洗补强 + 评测集           | P1        | 质量增强阶段基础设施           |
| 6      | Worker 并发调优                     | P2        | 需负载测试数据驱动             |
| 7      | 缓存收益量化                        | P2        | 为 P3 latency 达标提供依据     |
| 8      | MVP 沉淀文档（节点图 / token 模板） | P-1       | 验收交付物，不阻塞开发         |

---

## 9. 关键文件路径索引

### PDF 解析运行时

- 运行时实现：`packages/server/src/modules/document-index/services/parsers/pdf-parser.runtime.ts`（仅 docling）
- 配置 schema：`packages/server/src/shared/config/env.ts`（`DOCUMENT_INDEX_PDF_TIMEOUT` / `DOCUMENT_INDEX_PDF_CONCURRENCY`）

### Agent 工具

- `outline_search`：`packages/server/src/modules/agent/tools/outline-search.tool.ts`
- `node_read`：`packages/server/src/modules/agent/tools/node-read.tool.ts`
- `ref_follow`：`packages/server/src/modules/agent/tools/ref-follow.tool.ts`
- executor：`packages/server/src/modules/agent/agent-executor.ts`（`finalizeCitations` / `finalizeStopReason`）

### 结构化解析与搜索

- node builder：`packages/server/src/modules/document-index/services/parsers/structured-node-builder.ts`
- reference edge：`packages/server/src/modules/document-index/services/parsers/reference-edge-extractor.ts`
- front matter：`packages/server/src/modules/document-index/services/parsers/front-matter.ts`
- docling normalizer：`packages/server/src/modules/document-index/services/parsers/docling-markdown-normalizer.ts`
- outline search service：`packages/server/src/modules/document-index/services/search/outline-search.service.ts`
- node read service：`packages/server/src/modules/document-index/services/search/node-read.service.ts`
- ref follow service：`packages/server/src/modules/document-index/services/search/ref-follow.service.ts`

### 回填与队列

- backfill service：`packages/server/src/modules/document-index/services/document-index-backfill.service.ts`
- backfill CLI：`packages/server/src/scripts/document-index-backfill.ts`
- queue：`packages/server/src/modules/rag/queue/document-processing.queue.ts`
- queue config：`QUEUE_CONCURRENCY` / `QUEUE_MAX_RETRIES` / `QUEUE_BACKOFF_DELAY` / `QUEUE_BACKOFF_TYPE`

### VLM 图片描述

- VLM 模块：`packages/server/src/modules/vlm/`
- 图片分类：`packages/server/src/modules/document-index/services/image-description/image-classifier.ts`
- 图片 prompt：`packages/server/src/modules/document-index/services/image-description/image-description.prompts.ts`

### 测试

- e2e smoke：`packages/server/tests/e2e/`
- 结构化 RAG 集成测试：`packages/server/tests/integration/structured-rag/`
- document-index 单元测试：`packages/server/tests/modules/document-index/`
- agent 工具测试：`packages/server/tests/modules/agent/`
- fixture 数据：`packages/server/tests/fixtures/document-index/docling/`
