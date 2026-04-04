# 后端模块与工程目录守则

最后更新：2026-03-22

这份文档回答两件事：

- 如何在日常开发里守住已经清零的后端跨模块 deep import 债务
- 如何在工程文档里使用一致的后端配置目录表述，避免规范与实现再次漂移

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

### 2.2 不要拿 root barrel 代替 `public/*`

对于已经拆出能力级出口的模块，跨模块调用不要再写成：

- `@modules/document`
- `@modules/document-ai`
- `@modules/knowledge-base`
- `@modules/logs`
- `@modules/document-index`

改成对应能力出口，例如：

- `@modules/document/public/management`
- `@modules/document/public/repositories`
- `@modules/document/public/storage`
- `@modules/document-ai/public/analysis`
- `@modules/document-ai/public/generation`
- `@modules/document-ai/public/summary`
- `@modules/knowledge-base/public/management`
- `@modules/knowledge-base/public/counters`
- `@modules/logs/public/maintenance`
- `@modules/logs/public/repositories`
- `@modules/document-index/public/backfill`
- `@modules/document-index/public/artifact-cleanup`
- `@modules/document-index/public/indexing`

服务端模块边界门禁统一收口在 `packages/server/tools/architecture/`：

- `packages/server/tools/architecture/dependency-cruiser.cjs`
- `packages/server/tools/architecture/known-violations.json`
- `packages/server/tools/architecture/tsconfig.depcruise.json`

这里的 `dependency-cruiser` 规则已经对以上模块的跨模块 root barrel import 报错，避免“文档要求走 `public/*`，代码却还能偷走根出口”的回退。

### 2.3 public 入口变宽时

出现下面任一信号，就应该继续拆小：

- 一个 `public/*` 文件同时暴露多类不相关能力
- 导出名开始明显偏多，review 时已经难以判断“哪些是稳定契约”
- 不同消费方只会用到其中很小一部分能力

拆分优先级：

1. 先按能力拆文件，例如 `routing.ts`、`indexing.ts`、`repositories.ts`
2. 再让消费方改到更窄的出口
3. 最后删除已不再需要的宽出口

## 3. 配置与默认值目录约定

文档里如果提到 `env/schema.ts`、`env/configs.ts`、`defaults/*.defaults.ts`、`.env.example`，默认指下面这些仓库相对路径：

- `env/schema.ts` → `packages/server/src/core/config/env/schema.ts`
- `env/configs.ts` → `packages/server/src/core/config/env/configs.ts`
- `defaults/*.defaults.ts` → `packages/server/src/core/config/defaults/*.defaults.ts`
- `.env.example` → `packages/server/.env.example`

配置装配与对外出口也按下面理解：

- `packages/server/src/core/config/env/configs.ts` 负责合并 env 与 defaults
- `packages/server/src/core/config/env.ts` 是对业务代码暴露配置对象的统一入口
- 业务代码默认通过 `@config/env` 或 `@core/config/env` 使用配置，不再在文档里把 `shared/config/defaults` 写成默认目录

新增配置相关约定时，文档同步规则如下：

1. 新增环境变量：同时更新 `packages/server/.env.example` 和 `packages/server/src/core/config/env/schema.ts`
2. 新增业务默认值：写入 `packages/server/src/core/config/defaults/*.defaults.ts`
3. 新增配置对象：在 `packages/server/src/core/config/env/configs.ts` 组装，并通过 `packages/server/src/core/config/env.ts` 对外暴露

## 4. 提交前检查

后端模块边界相关改动提交前，至少执行：

```bash
pnpm architecture:check
```

如果你改了 `packages/server/tools/architecture/*` 里的 dependency-cruiser 规则、baseline 或 public API 结构，建议同时补充：

```bash
pnpm architecture:check:all
```

## 5. Review 清单

review 后端跨模块或配置规范改动时，默认检查下面四件事：

1. 新增复用是否经过 `public/*`
   不是直接走 `@modules/<module>` root barrel
2. `public/*` 是否仍然是能力分组，而不是新的 mega barrel
3. 文档中的目录表述是否仍与实际路径一致
4. `pnpm architecture:check` 是否为绿

## 6. CI 约束

仓库的 GitHub Actions 会在以下场景自动执行 `pnpm architecture:check`：

- 提向主干的 Pull Request
- 推送到 `main`

这条门禁不是为了增加规则，而是为了持续守住“跨模块 deep import 已清零”的状态。
