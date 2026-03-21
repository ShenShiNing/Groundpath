# 后端模块 Public API 守则

最后更新：2026-03-22

这份文档只回答一件事：如何在日常开发里守住已经清零的后端跨模块 deep import 债务。

## 1. 基本原则

- 后端模块之间的跨模块复用，默认只能经过拥有方模块的 `public/*` 出口。
- 不要直接 deep import 其他模块内部的 `controllers / services / repositories / utils`。
- `public/*` 不是“大总线”，而是按能力拆分的窄出口。

## 2. 日常流程

### 2.1 新增跨模块复用时

1. 先判断复用是否真的应该跨模块存在。
2. 如果确实需要跨模块复用，在拥有方模块新增或扩展一个窄 `public/*` 文件。
3. 让消费方只从这个 `public/*` 文件导入。

示例：

- 推荐：`packages/server/src/modules/document/public/storage.ts`
- 推荐：`packages/server/src/modules/document-index/public/routing.ts`
- 不推荐：直接导入 `packages/server/src/modules/document/services/...`

### 2.2 public 入口变宽时

出现下面任一信号，就应该继续拆小：

- 一个 `public/*` 文件同时暴露多类不相关能力
- 导出名开始明显偏多，review 时已经难以判断“哪些是稳定契约”
- 不同消费方只会用到其中很小一部分能力

拆分优先级：

1. 先按能力拆文件，例如 `routing.ts`、`indexing.ts`、`repositories.ts`
2. 再让消费方改到更窄的出口
3. 最后删除已不再需要的宽出口

## 3. 提交前检查

后端模块边界相关改动提交前，至少执行：

```bash
pnpm architecture:check
```

如果你改了 dependency-cruiser 规则、baseline 或 public API 结构，建议同时补充：

```bash
pnpm architecture:check:all
```

## 4. Review 清单

review 后端跨模块改动时，默认检查下面三件事：

1. 新增复用是否经过 `public/*`
2. `public/*` 是否仍然是能力分组，而不是新的 mega barrel
3. `pnpm architecture:check` 是否为绿

## 5. CI 约束

仓库的 GitHub Actions 会在以下场景自动执行 `pnpm architecture:check`：

- 提向主干的 Pull Request
- 推送到 `main`

这条门禁不是为了增加规则，而是为了持续守住“跨模块 deep import 已清零”的状态。
