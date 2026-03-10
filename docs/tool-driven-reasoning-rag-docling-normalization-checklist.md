# Docling 输出清洗可实施清单

更新时间：`2026-03-10`

适用范围：

1. `packages/server/src/modules/document-index/services/parsers/pdf-structure.parser.ts`
2. 未来的 `docling -> normalized markdown -> ParsedDocumentStructure` 链路
3. 当前 `quick` 样本：
   - `book-nist-ai-600-1`
   - `paper-attention-2017`
   - `synthetic-chart-dense-report`

当前判断：

1. `docling` 已经是当前环境里唯一可稳定运行的 PDF 结构化候选。
2. `docling` 输出明显优于 `pdf-parse`，但仍存在：
   - 标题误判
   - 目录表格重复列
   - 首页作者/元数据错绑
   - 断词、粘词、异常空格
   - `<!-- image -->` / `<!-- formula-not-decoded -->` 占位节点未结构化
3. 因此下一步不应直接把 `docling` 原始 Markdown 入图，而应先补“规范化层”。
4. 目前已落地的规范化能力包括：`Front Matter` 包裹、作者行过滤、目录点线清理、公式占位替换、基础断词/空白/表格列去重与锚点连字符归一化；图像占位绑定、目录权重下调、列表与表格更细粒度绑定仍需补强。

---

## 1. 实施目标

目标不是做“完美 PDF 还原”，而是让 `docling` 输出满足结构化 RAG 的最低可用条件：

1. 标题层级可稳定建树
2. 正文阅读顺序大体正确
3. 表格/图注/附录锚点可被识别
4. 噪声足够低，不会污染 citation 和 outline search

---

## 2. 推荐落点

建议新增：

1. `packages/server/src/modules/document-index/services/parsers/docling-markdown-normalizer.ts`
2. `packages/server/tests/modules/document-index/docling-markdown-normalizer.test.ts`

建议改造：

1. `packages/server/src/modules/document-index/services/parsers/pdf-structure.parser.ts`
2. `packages/server/src/modules/document-index/services/parsers/types.ts`
3. `packages/server/src/modules/document-index/services/document-index.service.ts`

建议链路：

1. `docling raw markdown`
2. `normalize markdown`
3. `parse normalized markdown to nodes`
4. `build edges / previews / locator`

---

## 3. 清洗规则 Checklist

### P0. 接入与可回退

- [x] 在 `pdf-structure.parser.ts` 中为 `parserRuntime=docling` 单独走规范化分支，而不是直接复用纯文本 heuristic。
- [ ] 保留原始 `docling` 输出作为调试产物，避免规范化后难以排查。
- [ ] 规范化失败时允许回退到当前 `parseHeuristicStructuredText(...)`，但必须记录 `parseMethod=fallback`。

验收：

- [ ] 同一份 PDF 可同时拿到 `raw markdown` 和 `normalized markdown`
- [ ] 规范化层抛错时不会阻断整个文档索引流程

### P1. 基础文本归一化

- [x] 合并连续空白行，最多保留 1 个空行
- [x] 统一中英文标点两侧异常空格
- [x] 清理明显 OCR/切词噪声：
  - `cross -sectoral -> cross-sectoral`
  - `profile s -> profiles`
  - `de sign -> design`
  - `Englishto-German -> English-to-German`
- [ ] 保留列表和表格中的必要换行，不做全局暴力拼段

落点：

- `docling-markdown-normalizer.ts` 的 `normalizeWhitespace()` / `fixBrokenTokens()`

验收：

- [ ] `book-nist` 中常见断词显著减少
- [ ] `paper-attention` 中连字符和数学/术语相邻文本不被错误合并

### P2. 标题清洗与降噪

- [x] 保留真正章节标题：如 `## 1. Introduction`、`## 3.2 Attention`
- [x] 对明显误判标题做降级：
  - 单个 KPI 名称：`Demand index`
  - 样式 callout：`Callout`
  - 普通元信息块：作者/机构/联系信息
- [x] 为“编号标题 / Chapter / Appendix / 第X章 / 附录X”建立稳定 heading 规则
- [ ] 对无编号但位于目录/封面区的展示型大字标题，允许作为根级 heading 保留

落点：

- `normalizeHeadings()`
- 必要时在 `types.ts` 增加中间态 `normalizedHeadingLevel`

验收：

- [ ] `synthetic-chart-dense-report` 中 `Callout` 不再默认成为高优先级章节节点
- [ ] `book-nist` 中 `Table of Contents`、`1. Introduction`、`2. Overview ...` 能形成稳定树
- [ ] `paper-attention` 中 `Abstract`、`1 Introduction`、`3.2.1 ...` 能保留为 heading

### P3. 首页元数据与作者区处理

- [x] 检测论文首页“作者矩阵/机构表格”，避免误当正文表格或章节
- [x] 将作者区整体归入 front matter，而不是拆成多个正文节点
- [ ] 对首页重复作者/机构行做去重
- [ ] front matter 不参与 `outline_search` 的高权重标题召回

落点：

- `normalizeFrontMatter()`
- `document-index.service.ts` 中检索材料构造逻辑

验收：

- [ ] `paper-attention` 首页不再把作者表格误识别为正文结构节点
- [ ] 作者区不会污染后续 `sectionPath`

### P4. 目录页处理

- [ ] 将目录识别为 `toc` 区块或低权重节点，而不是普通正文表格
- [x] 清理目录表格中的重复列和重复文本
- [x] 将目录项保留为 heading 候选，但不把页码点线当正文内容
- [ ] 目录项可用于补强标题召回，但不应优先于真实正文节点

落点：

- `normalizeTableOfContents()`
- `outline-search.service.ts` 的检索材料权重后续可接入

验收：

- [ ] `book-nist` 目录不再出现三列重复文本表格
- [ ] 目录项可以被识别，但不会取代正文同名标题

### P5. 表格规范化

- [x] 保留 Markdown 表格结构，不回退成纯文本段落
- [x] 对列数不一致的表格做补齐或降级，避免生成损坏 Markdown
- [x] 表头重复、空列、明显重复列要去重
- [ ] 表格标题或前导 caption 尽量绑定到表格节点

落点：

- `normalizeTables()`

验收：

- [ ] `synthetic-chart-dense-report` 的指标表保持为合法 Markdown 表格
- [ ] `paper-attention` 中 Table 1/2/3 不被打散成普通段落

### P6. 图像 / 图注 / 公式占位

- [ ] 对 `<!-- image -->` 生成结构化占位，不让它孤立成空段落
- [ ] 若前一行/后一行存在 `Figure X` 标题，绑定为 `figure` 节点
- [x] 对 `<!-- formula-not-decoded -->` 生成 `equation-placeholder` 或合并到所属段落
- [ ] 避免图像占位切断标题和正文的连续关系

落点：

- `normalizeMediaPlaceholders()`
- 后续 node builder 中映射 `figure/table/paragraph`

验收：

- [ ] `synthetic-chart-dense-report` 的 Figure 2-1 / 2-2 可与占位绑定
- [ ] `paper-attention` 的公式占位不会破坏章节/段落切分

### P7. 列表与编号项

- [ ] 识别 `- item`、`1. item`、`Appendix A` 类条目
- [ ] 避免把连续编号项每一行都升格成 heading
- [ ] 保留列表结构，方便后续内容预览和 citation excerpt

落点：

- `normalizeLists()`

验收：

- [ ] `book-nist` 风险列表保持为列表，不被拆成多个 heading
- [ ] `synthetic` 样本中的 bullet list 保持可读顺序

### P8. 附录 / 图表锚点 / locator 清洗

- [x] 规范化：
  - `Appendix A`
  - `Figure 2-1`
  - `Table 3-1`
  - `第3章`
- [ ] 生成统一锚点文本，供后续 `refers_to / cites` 边构建
- [ ] 锚点命中不依赖原文空格/连字符细节

落点：

- `normalizeAnchors()`
- 与 `reference-edge-extractor.ts` 对齐

验收：

- [ ] `synthetic-chart-dense-report` 中 `Appendix A / Figure 2-1 / Table 3-1` 都能稳定匹配
- [ ] `book-nist` 的 `Appendix A/B` 能稳定形成 locator

### P9. 节点切分策略

- [ ] front matter、目录、正文、附录应采用不同切分策略
- [ ] 短标题后紧跟短段落时，允许合并成同一节点上下文
- [ ] 图表/表格/公式占位附近不要按空行粗暴断节点
- [ ] 节点 token 预算超限时再二次切分，不在规范化阶段过早拆碎

落点：

- `pdf-structure.parser.ts`
- 或新增 `parseNormalizedMarkdownToStructure()`

验收：

- [ ] `paper-attention` 的 `Abstract` 不被拆碎
- [ ] `book-nist` 的二级标题下正文不会被过度切成单句节点

### P10. 检索材料友好化

- [ ] `title + sectionPath + contentPreview + alias anchors` 应基于规范化结果构造
- [ ] front matter 和目录节点默认降低检索权重
- [ ] 表格节点预览优先保留 caption + 表头，而不是整表全文

落点：

- `document-index.service.ts`
- 后续 `outline-search.service.ts`

验收：

- [ ] 结构化 search 不会优先命中作者区/目录页
- [ ] Figure/Table/Appendix 查询能命中真实节点

---

## 4. 测试清单

建议新增测试：

- [x] `docling-markdown-normalizer.test.ts`
- [x] `pdf-docling.integration.test.ts` 或并入现有 `pdf-structure.parser.test.ts`（已由 `docling-structured-flow.integration.test.ts` 覆盖）

必测用例：

- [ ] `book-nist`: 目录表格去重、正文 heading 保留、附录锚点保留
- [ ] `paper-attention`: 首页作者区降级、双栏正文顺序可读、章节标题保留、表格/图像占位保留
- [ ] `synthetic-chart-dense-report`: KPI 卡片不误判高阶 heading、图注与 `<!-- image -->` 绑定、Markdown 表格合法

回归断言建议：

- [ ] heading 数量不显著少于 `docling raw markdown`
- [ ] front matter 节点不会进入高优先级正文召回
- [ ] `Figure/Table/Appendix` 锚点召回数量达标
- [ ] 规范化后文本长度变化在合理范围内，不出现大面积内容丢失

---

## 5. 分阶段实施顺序

### Now-1

- [ ] P0 接入与可回退
- [ ] P1 基础文本归一化
- [ ] P2 标题清洗与降噪
- [ ] P5 表格规范化

目标：

- 先让 `docling` 输出能稳定建树，不追求所有版面都完美

### Now-2

- [ ] P3 首页元数据与作者区处理
- [ ] P6 图像 / 图注 / 公式占位
- [ ] P8 附录 / 图表锚点

目标：

- 解决论文首页和图表密集页的主要误差源

### Now-3

- [ ] P9 节点切分策略
- [ ] P10 检索材料友好化
- [ ] 完整测试矩阵

目标：

- 把规范化产物真正接到 `outline_search / node_read / ref_follow`

---

## 6. 完成定义

满足以下条件，才能认为 `docling normalization v1` 可进入主线试点：

1. `quick` 三份样本都能输出 `normalized markdown`
2. 标题树人工抽查通过
3. 目录、作者区、表格、图像占位不再明显污染正文结构
4. `Figure/Table/Appendix` 查询能命中真实节点
5. 至少有一组解析器单测和一组集成测试覆盖
