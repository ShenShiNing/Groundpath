# 用户完整硬删设计边界

最后更新：2026-04-02

## 1. 当前阶段结论

- 本阶段只推进 `documents -> users` 直接外键拆除。
- `knowledge_bases.user_id -> users.id` 与 `conversations.user_id -> users.id` 继续保持 `ON DELETE RESTRICT`。
- 原因不是数据库层做不到，而是“用户完整硬删”已经进入跨模块编排问题，不能靠继续改 FK 草率收尾。

## 2. 为什么 `knowledge_bases / conversations -> users` 需要单独设计

### `knowledge_bases`

`knowledge_bases` 不是纯元数据表，它是拥有型聚合，删除时还要成对处理：

- `documents` 元数据硬删
- 文档版本与图片等对象存储清理
- 向量库清理
- 结构化索引/节点/边/版本级联删除
- 计数器与删除日志

目前这些副作用由 [`knowledge-base.service.ts`](../packages/server/src/modules/knowledge-base/services/knowledge-base.service.ts) 编排。若直接把 `knowledge_bases_user_id_fk` 改成 `cascade`，数据库会先删行，但对象存储、向量、日志与补偿语义都不会自动发生。

### `conversations`

`conversations` 同样不是简单 FK 问题：

- 其下有 `messages -> conversations` 级联
- 会和 `knowledge_base_id` 形成双归属关系
- 当前删除只提供软删，不存在“按用户硬删全部会话”的统一 service

如果直接把 `conversations_user_id_fk` 改成 `cascade`，数据库能删数据，但不会留下明确的服务边界，也无法定义“知识库先删还是会话先删”的统一顺序。

## 3. 资源分层建议

建议把“用户完整硬删”按资源语义拆成三层：

### A. 数据库可直接级联

- `user_auths`
- `refresh_tokens`
- `user_token_states`

这些资源不带外部副作用，数据库级 `cascade` 足够。

### B. 必须走 service 编排

- `knowledge_bases`
- `documents` 相关对象存储 / 向量 / 结构化索引
- `conversations` / `messages`
- `llm_configs`
- 用户头像对象存储

这些资源需要明确顺序、幂等性与失败补偿。

### C. 审计/历史保留

- `login_logs`
- `operation_logs`

这类表当前没有数据库级 FK，更接近审计快照。完整硬删方案需要先定义“匿名化保留”还是“物理删除”。

## 4. 推荐实现方式

建议后续新增单一编排入口，例如：

- `packages/server/src/modules/user/services/user-deletion.service.ts`

由它统一负责：

1. 锁定用户实体，防止并发删除/恢复/登录态刷新交叉执行。
2. 快照该用户的知识库、会话、配置与外部存储引用。
3. 逐个调用拥有方 service 删除知识库，而不是绕过 service 直接删表。
4. 清理独立于知识库的会话与消息。
5. 删除 LLM 配置与头像等附属资源。
6. 最后硬删 `users`，让认证态相关表走数据库级 `cascade`。

## 5. 当前分支的明确边界

- 已覆盖：`documents_user_id_fk` 移除后的迁移与回归验证
- 暂不覆盖：`knowledge_bases/conversations -> users`
- 后续设计必须回答的两个问题：
  - 用户硬删时，知识库删除失败是否阻断整笔删除，还是允许进入补偿态
  - 绑定知识库的会话是跟随知识库删除，还是在删除知识库时先脱钩再单独处理
