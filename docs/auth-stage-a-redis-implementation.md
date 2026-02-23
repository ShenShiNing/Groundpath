# 阶段 A 实施记录：Redis 强制替换缓存与限流

## 1. 目标

- 将服务端缓存从内存实现迁移到 Redis
- 将限流从内存实现迁移到 Redis 原子计数
- 启动阶段强制校验 Redis 可用性（不可用则启动失败）

## 2. 依赖变更

## 新增依赖

- 包：`ioredis`
- 位置：`packages/server/package.json`
- 安装命令：`pnpm -F @knowledge-agent/server add ioredis`

## 3. 配置变更

## 新增环境变量

- `REDIS_URL`：Redis 连接地址（例如 `redis://localhost:6379`）
- `REDIS_PREFIX`：Redis key 前缀（默认 `knowledge-agent`）

## 修改文件

- `packages/server/src/shared/config/env.ts`
  - 新增 Redis 配置 schema 校验
  - 新增 `redisConfig` 导出
- `packages/server/.env.example`
  - 新增 Redis 配置示例

## 4. 新增代码

## Redis 客户端模块

- 新增：`packages/server/src/shared/redis/redis.client.ts`
  - `getRedisClient()`：获取单例 Redis 客户端
  - `connectRedis()`：应用启动前连接并 `PING`
  - `closeRedis()`：应用退出时关闭连接
  - `buildRedisKey()`：统一 key 前缀拼装

- 新增：`packages/server/src/shared/redis/index.ts`
  - 导出 Redis 客户端能力

## 5. 核心改造

## 缓存服务改造

- 修改：`packages/server/src/shared/cache/cache.service.ts`
  - 从内存 `Map` 改为 Redis 存储
  - `get/set/delete/deleteByPrefix/getOrSet` 全部改为异步
  - 使用 `SCAN + DEL` 实现前缀清理
  - 保留 `cacheService` 与 `shortCache` 两套实例，改为 Redis namespace 隔离

## Refresh Token 仓储适配

- 修改：`packages/server/src/modules/auth/repositories/refresh-token.repository.ts`
  - 适配缓存方法异步化（增加 `await`）

## 限流中间件改造

- 修改：`packages/server/src/shared/middleware/rate-limit.middleware.ts`
  - 移除内存 `Map` 计数与定时清理逻辑
  - 使用 Redis Lua 脚本实现原子 `INCR + PEXPIRE`
  - IP 限流与账号限流统一走 Redis
  - `checkAccountRateLimit/resetAccountRateLimit/incrementAccountRateLimit` 改为异步

## 认证服务适配

- 修改：`packages/server/src/modules/auth/services/auth.service.ts`
  - 适配账号限流 API 异步化：`await checkAccountRateLimit(...)`、`await resetAccountRateLimit(...)`

## 启动与关闭流程改造

- 修改：`packages/server/src/index.ts`
  - 启动前执行 `connectRedis()`
  - 关闭时执行 `closeRedis()`
  - 启动失败会记录 fatal 日志并退出进程

## 6. 影响面

- 缓存读写变为异步调用
- 限流能力依赖 Redis 服务可用性
- 登录流程中的账号限流变为异步 Redis 查询

## 7. 验证建议

1. 执行类型构建：`pnpm -F @knowledge-agent/server build`
2. 启动服务并观察启动日志是否成功连接 Redis
3. 人工验证：
   - 高频调用登录/刷新接口，检查限流行为
   - 横向启动多实例，验证限流与缓存一致性

