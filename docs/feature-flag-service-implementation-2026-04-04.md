# Feature Flag 服务化实现方案

最后更新：2026-04-04

这份文档描述目标实现形态，不是“最小可用版本”，而是适合长期维护的推荐做法。

## 1. 目标架构

目标架构分为四层：

- `env` 层：保留基础设施开关、调度开关和少量高风险能力的 kill switch
- 拥有方模块：声明自己的 flag 定义和对外能力接口
- `modules/feature-flag`：提供注册、持久化、评估、缓存、脚本控制和审计基础设施
- 消费方模块：通过拥有方模块的 `public/*` 能力接口使用 flag，不直接解释规则

核心原则：

- 发布语义归业务模块
- 规则存储与评估归基础设施
- 外部消费者不依赖裸 flag key

## 2. 模块边界

### 2.1 基础设施模块

新增模块：

- `packages/server/src/modules/feature-flag/`

建议目录：

```text
packages/server/src/modules/feature-flag/
  repositories/
    feature-flag.repository.ts
    feature-flag-target.repository.ts
    feature-flag-rollout.repository.ts
  services/
    feature-flag-registry.service.ts
    feature-flag-bootstrap.service.ts
    feature-flag-evaluation.service.ts
    feature-flag-management.service.ts
  public/
    contracts.ts
    evaluation.ts
    management.ts
```

职责：

- 提供类型契约
- 提供评估服务
- 提供规则存储与缓存
- 提供脚本 / 未来 API 可复用的管理服务

不负责：

- 拥有 `structured rag`、`image description` 这类业务语义
- 直接决定文档解析或 Agent 工具链行为

### 2.2 拥有方模块

以 `document-index` 为例，建议新增：

```text
packages/server/src/modules/document-index/public/feature-flags.ts
packages/server/src/modules/document-index/public/routing.ts
```

职责：

- 声明该模块拥有的 flag 定义
- 对外暴露稳定的“能力判断”接口

示例：

- `structuredRagModeFlag`
- `imageDescriptionFlag`
- `getDocumentIndexRoutePolicy(context)`
- `isStructuredKnowledgeBaseEnabled(context)`

这样 `agent` 模块依然从 `document-index/public/*` 获取能力，而不是直接依赖中心化字符串 key。

### 2.3 组合根注册

不要让 `modules/feature-flag` 反向导入所有业务模块，否则很容易形成循环依赖。

推荐做法：

- 由组合根在启动期收集各模块公开的 flag 定义
- 统一调用注册 / 同步逻辑

建议新增：

```text
packages/server/src/core/server/register-feature-flags.ts
```

由 `packages/server/src/index.ts` 在启动期调用。

## 3. Flag 定义契约

推荐采用“代码定义 + 数据库存状态”的混合模式。

建议契约：

```ts
export interface FeatureFlagDefinition<TVariant extends string> {
  key: string;
  owner: string;
  description: string;
  type: 'release' | 'ops-sensitive';
  variants: readonly TVariant[];
  defaultVariant: TVariant;
  supportedScopes: readonly ('user' | 'knowledge_base')[];
  envKillSwitch?: string;
  expiresAt?: string;
}
```

以 `structured rag` 为例：

```ts
export const structuredRagModeFlag = defineFeatureFlag({
  key: 'document_index.structured_rag_mode',
  owner: 'document-index',
  description: 'Controls legacy vs structured parsing and retrieval path',
  type: 'ops-sensitive',
  variants: ['legacy', 'structured'] as const,
  defaultVariant: 'legacy',
  supportedScopes: ['user', 'knowledge_base'] as const,
  envKillSwitch: 'STRUCTURED_RAG_ENABLED',
  expiresAt: '2026-09-30',
});
```

说明：

- 布尔开关只是单 variant 的特例
- 对长期维护更友好的建模是 variant，而不是 everywhere `enabled: boolean`
- `structured rag` 本质上是模式选择，不只是开或关

## 4. 数据模型

推荐新增三张系统表。

建议文件：

```text
packages/server/src/core/db/schema/system/feature-flags.schema.ts
packages/server/src/core/db/schema/system/feature-flag-targets.schema.ts
packages/server/src/core/db/schema/system/feature-flag-rollouts.schema.ts
```

### 4.1 `feature_flags`

用途：

- 存放每个 flag 的运行时状态
- 不重复存放 owner / 文档说明等代码注册信息

建议字段：

| 字段                        | 说明                                 |
| --------------------------- | ------------------------------------ |
| `key`                       | 主键，和代码定义一致                 |
| `status`                    | `active` / `paused` / `archived`     |
| `default_variant`           | 运行时默认 variant，可覆盖代码默认值 |
| `version`                   | 规则快照版本，每次变更自增           |
| `notes`                     | 运行时备注                           |
| `created_by` / `updated_by` | 变更人                               |
| `created_at` / `updated_at` | 审计时间                             |

### 4.2 `feature_flag_targets`

用途：

- 存放显式目标命中规则
- 支持按 `user` / `knowledge_base` 精确灰度

建议字段：

| 字段                        | 说明                      |
| --------------------------- | ------------------------- |
| `id`                        | 主键                      |
| `flag_key`                  | 关联 `feature_flags.key`  |
| `subject_type`              | `user` / `knowledge_base` |
| `subject_id`                | 目标实体 ID               |
| `variant`                   | 命中后返回的 variant      |
| `start_at` / `end_at`       | 可选生效时间窗            |
| `metadata`                  | 备注或来源信息            |
| `created_by` / `updated_by` | 审计字段                  |
| `created_at` / `updated_at` | 审计时间                  |

约束建议：

- 对同一 `flag_key + subject_type + subject_id` 保持单活跃记录
- 通过服务层 upsert，避免重复白名单行

### 4.3 `feature_flag_rollouts`

用途：

- 存放百分比放量规则

建议字段：

| 字段                        | 说明                      |
| --------------------------- | ------------------------- |
| `id`                        | 主键                      |
| `flag_key`                  | 关联 `feature_flags.key`  |
| `scope_type`                | `user` / `knowledge_base` |
| `percentage`                | `0-100`                   |
| `variant`                   | 命中后返回的 variant      |
| `bucket_salt`               | 哈希盐，保证桶稳定        |
| `start_at` / `end_at`       | 可选生效时间窗            |
| `metadata`                  | 备注                      |
| `created_by` / `updated_by` | 审计字段                  |
| `created_at` / `updated_at` | 审计时间                  |

设计取舍：

- 不引入通用规则 DSL
- 显式目标与百分比放量分表
- 规则可解释性远优于“一个 JSON 条件表达式字段”

## 5. 审计模型

不建议另起一套“变更日志表”。

更合适的方式：

- 复用现有 `operation_logs`
- 扩展 `resource_type` 支持 `feature_flag`
- 扩展 `action` 支持：
  - `feature_flag.create`
  - `feature_flag.update`
  - `feature_flag.target.upsert`
  - `feature_flag.target.delete`
  - `feature_flag.rollout.upsert`
  - `feature_flag.rollout.delete`
  - `feature_flag.archive`

每次管理变更记录：

- 变更前 `oldValue`
- 变更后 `newValue`
- 影响的 flag key
- 操作人
- 可选原因说明

## 6. 评估链路

### 6.1 输入上下文

统一上下文建议至少包含：

```ts
export interface FeatureFlagEvaluationContext {
  userId?: string | null;
  knowledgeBaseId?: string | null;
}
```

### 6.2 返回结果

建议返回值：

```ts
export interface FeatureFlagDecision<TVariant extends string> {
  key: string;
  enabled: boolean;
  variant: TVariant;
  reason:
    | 'env_kill_switch'
    | 'flag_paused'
    | 'explicit_user_target'
    | 'explicit_knowledge_base_target'
    | 'knowledge_base_rollout'
    | 'user_rollout'
    | 'default_variant';
  source: 'env' | 'db' | 'code_default';
  version: number;
}
```

### 6.3 命中优先级

推荐优先级：

1. env kill switch
2. flag 状态不是 `active`
3. 显式 `user` 目标
4. 显式 `knowledge_base` 目标
5. `knowledge_base` 百分比放量
6. `user` 百分比放量
7. 默认 variant

理由：

- 高风险能力必须允许 env 一键熔断
- 显式目标优先于百分比放量
- `user` 精确覆盖允许对单个用户做 opt-out / opt-in
- `knowledge_base` 放量优先于 `user` 放量，因为这类能力常常直接作用在资源本身

### 6.4 百分比算法

建议：

- 使用稳定哈希，不使用随机数
- 以 `flag_key + scope_type + subject_id + bucket_salt` 计算桶
- 同一 subject 在规则不变时必须稳定落在同一桶

## 7. 缓存与一致性

### 7.1 缓存落点

复用现有 `core/cache` 抽象，新增一个专用 namespace。

建议：

- namespace: `feature-flags`
- 缓存对象：按 `flag key + version` 的规则快照

例如：

- `feature-flags:flag:document_index.structured_rag_mode:v12`

### 7.2 失效策略

规则变更流程必须是：

1. 事务内更新 `feature_flags` / `targets` / `rollouts`
2. 自增 `version`
3. 在 `afterCommit` 回调中删除旧缓存前缀

不要在事务提交前删除缓存，否则会出现：

- 请求读到缓存 miss
- 回源数据库时读到未提交或即将回滚的状态

### 7.3 启动期同步

`feature-flag-bootstrap.service.ts` 负责：

- 校验代码定义是否都已注册
- 为新定义 flag 补建 `feature_flags` 默认行
- 对已存在记录保持幂等

这一步必须可重复执行。

## 8. 长流程决策快照

这是本方案里最重要的长期维护要求之一。

### 8.1 原则

- 进入多步流程时评估一次
- 后续重试 / 补偿 / 恢复不重新评估
- 决策结果和版本号一起持久化

### 8.2 通用快照结构

```ts
export interface FeatureDecisionSnapshot {
  key: string;
  variant: string;
  reason: string;
  version: number;
  decidedAt: string;
}
```

### 8.3 在 Groundpath 中的推荐落点

对 `structured rag`：

- 入口：文档上传或构建编排服务
- 持久化位置：建议给 `packages/server/src/core/db/schema/document/document-index-versions.schema.ts` 对应表增加 `feature_decisions` JSON 字段
- 队列任务：job payload 携带该快照

原因：

- `document_index_versions` 是不可变构建记录
- 路由模式天然属于“某次构建的决策结果”
- 重试 worker 时无需重新命中发布规则

## 9. 管理入口

### 9.1 第一阶段

当前仓库没有成熟 admin / RBAC 模型，建议先提供脚本控制面。

建议目录：

```text
packages/server/src/scripts/feature-flags/
  list.ts
  show.ts
  upsert-target.ts
  upsert-rollout.ts
  archive.ts
```

原则：

- 脚本只调用 `featureFlagManagementService`
- 脚本不直接访问 repository

### 9.2 后续阶段

当权限模型成熟后，再新增：

```text
packages/server/src/modules/feature-flag/feature-flag.routes.ts
packages/server/src/modules/feature-flag/controllers/feature-flag.controller.ts
```

路由建议：

- `/api/v1/internal/feature-flags`

在没有 admin 角色体系之前，不建议直接放到面向普通业务用户的 API 面。

## 10. 迁移现有 Structured RAG 逻辑

### 10.1 目标 flag

建议定义：

- `document_index.structured_rag_mode`

variants：

- `legacy`
- `structured`

### 10.2 与现有 env 的映射

| 现有项                             | 迁移后角色                    |
| ---------------------------------- | ----------------------------- |
| `STRUCTURED_RAG_ENABLED`           | 保留为 env kill switch        |
| `STRUCTURED_RAG_ROLLOUT_MODE`      | 迁移为服务规则                |
| `STRUCTURED_RAG_INTERNAL_USER_IDS` | 迁移为 `feature_flag_targets` |
| `STRUCTURED_RAG_INTERNAL_KB_IDS`   | 迁移为 `feature_flag_targets` |

### 10.3 模块内收口

`document-index` 应提供统一能力接口，例如：

- `getDocumentIndexRoutePolicy(context)`
- `isStructuredKnowledgeBaseEnabled(context)`

这样：

- `document-parse-router.service.ts` 使用同一来源
- `agent` 模块仍经由 `@modules/document-index/public/*` 获取能力
- 不把 `agent` 直接绑到 Feature Flag 基础设施细节上

### 10.4 废弃路径

迁移完成后：

- 删除 `structured-rag-rollout.service.ts`
- 清理 `STRUCTURED_RAG_ROLLOUT_MODE`
- 清理 `STRUCTURED_RAG_INTERNAL_USER_IDS`
- 清理 `STRUCTURED_RAG_INTERNAL_KB_IDS`

保留：

- `STRUCTURED_RAG_ENABLED`

## 11. 迁移现有 Image Description 逻辑

建议定义：

- `document_index.image_description`

variant 可先保持布尔语义：

- `disabled`
- `enabled`

映射原则：

- `IMAGE_DESCRIPTION_ENABLED` 保留为 env kill switch
- user / KB 白名单与百分比规则交由服务管理
- 高成本能力必须保留全局熔断手段

## 12. 配置与默认值

按仓库约定：

- 业务默认值写入 `packages/server/src/core/config/defaults/*.defaults.ts`
- env 只承载基础设施和少量 kill switch

建议新增：

```text
packages/server/src/core/config/defaults/feature-flag.defaults.ts
```

包含：

- 规则缓存 TTL
- rollout bucket salt 默认值
- 启动期同步批大小

不建议新增：

- `FEATURE_FLAG_*` 大量业务环境变量

原因：

- 会把业务发布系统重新拉回 env 驱动

## 13. 测试策略

### 13.1 单元测试

- 评估优先级
- env kill switch 覆盖
- 显式目标命中
- 百分比桶稳定性
- 默认 variant 回退

### 13.2 集成测试

- bootstrap 幂等
- target / rollout upsert 幂等
- 缓存失效在事务提交后执行
- 审计日志完整写入

### 13.3 业务回归测试

至少覆盖：

- `structured rag` 路由判断
- Agent 工具选择
- image description 能力判断
- 长流程在规则变更后重试仍消费旧快照

## 14. 推荐实施顺序

工程实施时，建议按下面顺序落地：

1. 建基础设施模块与数据表
2. 加启动注册 / 同步
3. 加缓存与审计
4. 加脚本控制面
5. 迁移 `structured rag`
6. 迁移 `image description`
7. 权限模型成熟后再补 API / UI

## 15. 结论

Groundpath 适合的长期方案，不是“把 env 白名单搬进数据库”，而是：

- 用统一基础设施管理运行时发布规则
- 让拥有方模块继续拥有业务语义
- 用 env 保留高风险能力的紧急熔断
- 用决策快照守住长流程一致性

这套边界一旦建立，后续再新增需要灰度的业务能力时，不必重复发明 rollout 逻辑，也不会把 `featureFlags` 配置对象继续演化成新的业务 mega barrel。
