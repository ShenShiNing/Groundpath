# Tool-Driven RAG PDF 样本集

更新时间：`2026-03-10`

用途：

1. 为 `marker / docling / pdf-parse + heuristic` 做同一批 PDF 对比。
2. 覆盖 `规范书籍 / 长手册 / 双栏论文 / 图表密集报告` 四类版式。
3. 为后续记录 `解析质量 / 耗时 / 失败类型 / citation 表现` 提供固定样本池。

建议目录：

- 本地缓存目录：`.cache/structured-rag/pdf-samples/`
- 准备脚本：`scripts/download-structured-rag-pdf-samples.ps1`
- 合成样本生成器：`scripts/generate-structured-rag-synthetic-pdfs.py`
- 批量对比脚本：`scripts/compare-structured-rag-pdf-runtimes.py`

## 推荐样本

| ID                              | 类别                | 文件名                                     | 文档                                  | 主要版式压力点                                       | 来源                                                                                          |
| ------------------------------- | ------------------- | ------------------------------------------ | ------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `book-nist-ai-600-1`            | 规范书籍 / 标准指南 | `book-nist-ai-600-1.pdf`                   | NIST AI 600-1: Generative AI Profile  | 多级编号标题、附录、表格、术语定义、稳定章节结构     | https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf                                        |
| `manual-postgresql-17`          | 超长规范手册        | `manual-postgresql-17-a4.pdf`              | PostgreSQL 17 Documentation (A4 PDF)  | 超长目录、深层 heading、代码块、列表、表格、附录     | https://www.postgresql.org/files/documentation/pdf/17/postgresql-17-A4.pdf                    |
| `paper-attention-2017`          | 双栏论文            | `paper-attention-is-all-you-need-2017.pdf` | Attention Is All You Need             | 双栏、公式、图、脚注、参考文献、页内浮动元素         | https://papers.nips.cc/paper_files/paper/2017/file/3f5ee243547dee91fbd053c1c4a845aa-Paper.pdf |
| `synthetic-chart-dense-report`  | 图表密集报告        | `synthetic-chart-dense-report.pdf`         | Synthetic Grid Outlook Report         | 多图表页、图注、指标卡片、表格与附录引用             | 本地生成                                                                                      |
| `synthetic-mixed-layout-report` | 图表密集报告        | `synthetic-mixed-layout-report.pdf`        | Synthetic Mixed Layout Program Review | 双栏正文、侧栏 callout、图表占位、附录表格、定位锚点 | 本地生成                                                                                      |

## 最小执行集

如果这轮只想先做最小验证，先用这 3 份：

1. `book-nist-ai-600-1`
2. `paper-attention-2017`
3. `synthetic-chart-dense-report`

这样已经能覆盖：

1. 标准化章节树
2. 双栏论文
3. 图表密集杂志式报告

## 最新对比结果（quick）

执行时间：`2026-03-10`

结论摘要：

1. `pdf-parse`：3/3 成功，平均耗时约 `238ms`。
2. `docling`：3/3 成功，平均耗时约 `18s`。
3. `marker`：3/3 均为 `unavailable`（缺少本地模型资产 `table_recognition / text_detection / ocr_error_detection`）。

报告产物：

- `.cache/structured-rag/pdf-runtime-compare/latest.md`
- `.cache/structured-rag/pdf-runtime-compare/latest.json`

下一步：

1. 补齐 marker 本地模型或开启 `--allow-model-download` 后重跑对比。
2. 记录 marker 的成功率、耗时与标题/图表锚点质量指标，用于最终选型结论。

## 推荐评测维度

每份 PDF 至少记录以下结果：

1. `parse_success`
2. `parser_runtime`
3. `duration_ms`
4. `heading_count`
5. `page_coverage`
6. `orphan_node_ratio`
7. `figure/table anchor recall`
8. `citation locator quality`
9. `fallback_required`

## 采样理由

### 1. `book-nist-ai-600-1`

- 适合验证“规范章节树”是否能稳定提取。
- 能检查 appendices、术语表、编号小节的层级保真度。

### 2. `manual-postgresql-17`

- 适合验证超长文档的性能边界。
- 能检查目录极长时的标题切分、页码映射和内存占用。

### 3. `paper-attention-2017`

- 适合验证双栏、公式和参考文献区域对结构解析的影响。
- 能快速看出 `marker / docling` 在学术论文版式上的差异。

### 4. `synthetic-chart-dense-report`

- 适合稳定复现“图表页 + 说明文字 + 表格 + appendix anchor”混排。
- 不依赖外部网站，可重复生成，适合回归测试。

### 5. `synthetic-mixed-layout-report`

- 适合验证双栏正文、侧栏说明、假图表区域和附录表格共存时的切分表现。
- 对 `marker / docling / pdf-parse + heuristic` 的差异更容易肉眼比对。

## 使用建议

1. 先对 5 份样本都跑 `pdf-parse + heuristic`，建立当前基线。
2. 再对同一批样本跑 `marker` 和 `docling`。
3. 结果单独沉淀为对比表，至少包含：
   - 标题层级正确率
   - 页码定位可用率
   - 图表 / 附录锚点召回
   - 平均耗时
   - 峰值资源占用
   - 是否需要 fallback

## 准备方式

运行一次下面的脚本即可：

```powershell
& 'C:\Program Files\PowerShell\7\pwsh.exe' -File '.\scripts\download-structured-rag-pdf-samples.ps1'
```

脚本行为：

1. 下载 3 份稳定公开 PDF
2. 本地生成 2 份可控图表密集样本
3. 在 `.cache/structured-rag/pdf-samples/manifest.json` 写出结果清单

批量对比可直接运行：

```powershell
pnpm pdf:samples:compare
```

默认是 `quick` 模式，只跑 3 份最小样本集，并且只比较：

1. `pdf-parse`
2. `docling`

默认不带 `marker`，因为当前环境里它缺少本地模型，加入默认对比只会增加等待时间。

`quick` 样本集：

1. `book-nist-ai-600-1`
2. `paper-attention-2017`
3. `synthetic-chart-dense-report`

如果要跑 5 份全量样本：

```powershell
pnpm pdf:samples:compare:full
```

如果你要显式把 `marker` 也带上：

```powershell
pnpm pdf:samples:compare:with-marker
```

默认输出：

1. `.cache/structured-rag/pdf-runtime-compare/latest.json`
2. `.cache/structured-rag/pdf-runtime-compare/latest.md`

说明：

1. `pdf-parse` 直接调用当前 `packages/server` 运行时。
2. 默认支持复用每个 `runtime/sample` 目录下的 `result.json`，中断后再次执行会继续复用已有结果；如需强制重跑，传 `--force`。
3. `marker / docling` 默认优先走工作区内的 Python 3.12 运行时；如未准备好，则退回本机 CLI / 环境。
4. `pdf-parse` 默认超时是 `180s`；`marker / docling` 默认超时是 `600s`。
5. 当前默认对 born-digital PDF 会走较轻路径：
   - `marker`: `--disable_ocr`
   - `docling`: `--no-ocr`
6. 默认是离线优先：
   - 本地缺少 `marker/docling` 模型时，会快速标记为不可用，而不是长时间等待下载。
   - 只有显式传 `--allow-model-download`，才会尝试联网拉模型。
7. 如需自定义命令，可传：
   - `--marker-command`
   - `--docling-command`
