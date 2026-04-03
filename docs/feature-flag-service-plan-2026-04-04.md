# Feature Flag 服务化计划方案

最后更新：2026-04-04

这份文档回答两件事：

- 如何把当前散落在 `env` 与模块私有逻辑中的发布开关，收敛成长期可维护的 Feature Flag 控制面
- 如何在不打破现有模块边界、幂等性和事务约束的前提下，分阶段推进这项改造

## 1. 背景

当前仓库已经具备“基础开关 + 单功能灰度”的雏形：

- 全局开关定义在 `packages/server/src/core/config/env/schema.ts` 与 `packages/server/src/core/config/env/configs.ts`
- `structured rag` 已有按 `userId` / `knowledgeBaseId` 的定制灰度逻辑
- 文档解析路由与 Agent 工具选择已经依赖该逻辑

现状的问题不是“完全没有灰度能力”，而是“灰度能力仍停留在功能特例与部署配置层”：

- 业务发布规则依赖 env，变更成本高，天然和部署绑定
- 同类逻辑已经开始在不同模块重复出现
- 缺少统一的缓存、审计、命中解释与生命周期治理
- 长流程没有显式决策快照，未来扩展后容易出现“重试前后行为不一致”

## 2. 目标

目标不是做一个“开关表”，而是建立一套受治理的发布控制能力。

本计划的目标：

- 支持业务功能按 `user` / `knowledge_base` 精确灰度
- 保留高风险能力的 env 级紧急熔断能力
- 让功能归属模块继续拥有自己的发布语义，不把所有业务知识堆进一个中心模块
- 统一评估、缓存、审计、脚本控制与后续管理 API 的底层能力
- 对多步流程提供稳定决策快照，保证重试、恢复、补偿时行为一致

本计划不追求：

- 一次性把所有现有 env 开关全部迁入服务
- 在当前没有 RBAC / admin 能力的前提下，立刻补一套面向终端用户的管理后台
- 引入通用 JSON DSL 规则引擎

## 3. 范围边界

### 3.1 开关分类

不是所有“布尔配置”都应该服务化。长期维护下，应先分层。

| 分类                | 典型项                                                                                                             | 管理方式         | 说明                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------- | ------------------------------------------ |
| 基础设施 / 运维开关 | `DISABLE_RATE_LIMIT`、`QUEUE_DRIVER`、`CACHE_DRIVER`、`LOCK_DRIVER`                                                | 保持 `env`       | 启动期生效或故障期必须可用，不应依赖数据库 |
| 调度 / 维护开关     | `COUNTER_SYNC_ENABLED`、`DOCUMENT_PROCESSING_RECOVERY_ENABLED`、`LOG_CLEANUP_ENABLED`、`BACKFILL_SCHEDULE_ENABLED` | 保持 `env`       | 更接近运维能力启停，不属于产品发布         |
| 高风险业务能力总闸  | `STRUCTURED_RAG_ENABLED`、`IMAGE_DESCRIPTION_ENABLED`                                                              | `env` + 服务双控 | `env` 负责 kill switch，服务负责灰度与放量 |
| 业务发布规则        | `STRUCTURED_RAG_ROLLOUT_MODE`、`STRUCTURED_RAG_INTERNAL_USER_IDS`、`STRUCTURED_RAG_INTERNAL_KB_IDS`                | 迁入服务         | 这部分才是 Feature Flag 服务化的核心对象   |

### 3.2 第一批纳管能力

第一批建议只纳管两个方向：

- `document_index.structured_rag_mode`
- `document_index.image_description`

原因：

- 都已存在现实开关与灰度诉求
- 都与 `user` / `knowledge_base` 强相关
- 都属于高风险或高成本能力，适合保留 env 总闸 + 服务灰度的双层模型

## 4. 设计原则

### 4.1 双层控制

- `env` 继续承担启动期保护和事故时的一键熔断
- Feature Flag 服务承担日常灰度、放量、白名单和默认策略

### 4.2 所有权归模块，基础设施归统一服务

- Flag 的发布语义由拥有该能力的模块声明
- Flag 的持久化、缓存、评估、脚本控制和审计由统一基础设施提供
- 跨模块消费者不依赖裸字符串 key，而依赖拥有方模块通过 `public/*` 暴露的稳定能力接口

### 4.3 强类型优先，不做通用 DSL

- 代码中保留强类型 flag 定义
- 数据库只承载运行时状态、显式目标和百分比放量
- 不引入可无限组合的 JSON 表达式系统

### 4.4 长流程只评估一次

- 上传、解析、构建、恢复、重试等多步流程在编排入口评估 Feature Flag
- 决策结果进入任务载荷或不可变版本记录
- 后续步骤消费决策快照，不在中途重新评估

### 4.5 管理变更必须可审计

- 任何运行时变更都必须记入 `operation_logs`
- 缓存失效必须在事务提交后发生，避免脏读
- 后台任务和同步脚本必须幂等

## 5. 分阶段计划

### 5.1 第 0 阶段：范围冻结与规则分类

目标：

- 先把“哪些应该服务化、哪些不应该”定下来，避免越做越宽

交付物：

- 本计划文档
- 实现方案文档
- 现有开关分类清单
- 第一批纳管 flag 清单

完成标准：

- 团队对“env 保留项 / 服务迁移项 / 双控项”达成一致
- 后续实现不再新增新的业务发布逻辑到 `featureFlags` env 对象中

### 5.2 第 1 阶段：Feature Flag 基础设施落地

目标：

- 提供统一的注册、评估、缓存、持久化、脚本控制与审计能力

交付物：

- `modules/feature-flag` 基础设施模块
- 系统表：flag 状态、显式目标、百分比放量
- 启动期注册 / 同步机制
- 管理脚本
- 单元测试与集成测试

完成标准：

- 任一纳管 flag 都可通过统一评估服务得到稳定决策
- 规则更新后缓存能在事务提交后失效
- 所有变更都有操作审计

### 5.3 第 2 阶段：Structured RAG 迁移

目标：

- 用统一基础设施替换当前 `structured-rag-rollout.service.ts` 的特例逻辑

交付物：

- `document-index` 模块自己的 flag 定义
- `document-index` 公开的路由 / 能力策略接口
- 文档解析与 Agent 工具选择迁移到新接口
- 决策快照进入索引构建记录与任务载荷

完成标准：

- `STRUCTURED_RAG_ROLLOUT_MODE`、`STRUCTURED_RAG_INTERNAL_USER_IDS`、`STRUCTURED_RAG_INTERNAL_KB_IDS` 不再作为主控制源参与业务判断
- `STRUCTURED_RAG_ENABLED` 继续保留为 env kill switch

### 5.4 第 3 阶段：Image Description 迁移

目标：

- 将 `IMAGE_DESCRIPTION_ENABLED` 从“单纯全局开关”升级为“env 总闸 + 按 user / KB 的服务灰度”

交付物：

- `document_index.image_description` flag 定义
- 图像描述相关评估逻辑统一收口
- 对高成本外部调用保留 env 紧急关停能力

完成标准：

- image description 的日常试点发布不再依赖改 env 白名单

### 5.5 第 4 阶段：控制面扩展

目标：

- 在权限模型成熟后，补足管理 API / 管理界面

交付物：

- Internal 或 Admin 管理 API
- 规则查看、变更、审计查询能力
- 必要时补充共享类型给前端控制面

完成标准：

- 运营或研发无需直接改库或改 env 即可完成常规灰度

说明：

- 当前仓库尚无成熟 RBAC / admin 能力，不建议把这一步前置到第 1 阶段

## 6. 阶段顺序与依赖

推荐顺序：

1. 先完成基础设施与脚本控制面
2. 再迁移 `structured rag`
3. 再迁移 `image description`
4. 最后视权限模型补管理 API / UI

不建议的顺序：

- 先做后台页面，再补基础设施
- 先把所有 env 开关迁库，再讨论分类边界
- 在多个模块分别复制 rollout 逻辑，然后期望后面统一收口

## 7. 风险与应对

### 7.1 风险：把所有开关都服务化

问题：

- 运维能力启停反而依赖数据库与缓存，故障期最脆弱

应对：

- 只迁移业务发布规则
- 保留基础设施 / 调度类 env 开关

### 7.2 风险：Feature Flag 模块变成业务 mega barrel

问题：

- 所有业务语义都堆在中心模块，边界腐蚀

应对：

- 定义归拥有方模块
- `modules/feature-flag` 只提供基础设施，不拥有业务能力解释

### 7.3 风险：长流程中途重算导致行为漂移

问题：

- 队列重试前后命中不同规则，导致解析模式或工具链切换

应对：

- 统一在编排入口生成决策快照
- 后续步骤只消费快照

### 7.4 风险：控制面过早暴露 HTTP API

问题：

- 当前没有清晰 admin 权限模型，容易带来安全与审计问题

应对：

- 第 1 阶段先提供 service + script
- API / UI 延后到 RBAC 成熟后

## 8. 验收标准

项目完成后，至少满足以下标准：

- 业务发布规则不再主要依赖 env 白名单实现
- 任何纳管 flag 的评估都通过统一基础设施完成
- `document-index`、`agent` 等模块仍通过拥有方模块的 `public/*` 契约协作
- 运行时规则变更有审计日志
- 规则缓存失效在事务提交后执行
- 多步流程能持久化 feature decision snapshot
- 迁移后的 `structured rag` 与 `image description` 支持 `user` / `knowledge_base` 级灰度

## 9. 推荐落地顺序总结

短结论：

- 先把 Feature Flag 做成“基础设施”
- 再把 `structured rag` 从“单功能特例”迁成“第一个正式接入者”
- 再扩大到其他高风险业务能力
- 管理 API / UI 不前置，避免在权限边界尚未成型时把控制面做错
