# 阶段 B 实施记录：鉴权读路径优化（单次查询 + Redis 鉴权态缓存）

## 1. 目标

- 将 access 鉴权从“两次查库”优化为“一次聚合查询”
- 为鉴权态增加短 TTL Redis 缓存，降低数据库压力
- 在 `token_valid_after` 变更时主动失效鉴权态缓存

## 2. 依赖变更

- 无新增依赖
- 复用阶段 A 已引入 Redis 基础设施与缓存服务

## 3. 核心改造

## 3.1 用户仓储新增聚合鉴权态查询

文件：`packages/server/src/modules/user/repositories/user.repository.ts`

- 新增 `UserAccessAuthState`：
  - `id`
  - `status`
  - `tokenValidAfter`
- 新增 `findAccessAuthStateById(userId)`：
  - 使用 `users + user_token_states` 的单次查询（`leftJoin`）
  - 结果写入 Redis 短 TTL 缓存（45 秒）
- 兼容保留 `findAuthStateById(userId)`，内部复用新方法并返回精简结构

## 3.2 鉴权中间件切换到聚合鉴权态

文件：`packages/server/src/shared/middleware/auth.middleware.ts`

- `authenticate`：
  - 从 `findAuthStateById + getTokenValidAfter` 双查，改为 `findAccessAuthStateById` 单查
- `optionalAuthenticate`：
  - 同步改为单查逻辑
- 失效判断改为直接使用 `authState.tokenValidAfter`

## 3.3 缓存失效机制

文件：`packages/server/src/modules/user/repositories/user.repository.ts`

- 新增 `invalidateAccessAuthStateCache(userId)`：
  - 删除用户鉴权态缓存 key

文件：`packages/server/src/modules/auth/repositories/user-token-state.repository.ts`

- `bumpTokenValidAfter(userId)` 完成数据库写入后，立即调用：
  - `userRepository.invalidateAccessAuthStateCache(userId)`

## 4. 受影响文件清单

- `packages/server/src/modules/user/repositories/user.repository.ts`
- `packages/server/src/shared/middleware/auth.middleware.ts`
- `packages/server/src/modules/auth/repositories/user-token-state.repository.ts`

## 5. 验证

已执行：

- `pnpm -F @knowledge-agent/server build`

结果：

- TypeScript 构建通过

