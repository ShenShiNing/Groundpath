# 缓存驱动抽象方案

> 日期：2026-04-04
> 目标：为服务端缓存能力引入可替换 driver，在本地开发场景下允许无 Redis 启动，同时不弱化生产环境的一致性语义。

---

## 1. 现状

当前仓库里存在三类 Redis 使用方式，它们的语义并不相同：

| 类别           | 现有入口           | 典型文件                                                       | 语义                             |
| -------------- | ------------------ | -------------------------------------------------------------- | -------------------------------- |
| KV 缓存        | `@core/cache`      | `packages/server/src/core/cache/cache.service.ts`              | TTL、按前缀失效、cache-aside     |
| 速率限制计数器 | `@core/middleware` | `packages/server/src/core/middleware/rate-limit.middleware.ts` | 原子递增、窗口 TTL               |
| 分布式协调锁   | `@core/redis` 直连 | `packages/server/src/modules/vector/vector-cleanup.service.ts` | `SET NX PX` + compare-and-delete |

同时，进程启动和健康检查仍然把 Redis 当作无条件必需依赖：

- `packages/server/src/index.ts` 在启动时总是执行 `connectRedis()`
- `packages/server/src/core/health/health.service.ts` 的 readiness 总是检查 `redis`
- `packages/server/src/core/server/shutdown.ts` 总是执行 `closeRedis()`

这会带来两个问题：

1. “缓存系统抽象”如果只包一层 `CacheService` 接口，仍然无法解决本地无 Redis 启动的问题。
2. 如果把限流和锁语义硬塞进“缓存接口”，接口会迅速退化成新的 Redis mega abstraction。

---

## 2. 目标

本方案的目标：

1. 为纯缓存场景提供 `redis` / `memory` 两种 driver。
2. 本地开发可通过配置切换到内存缓存，不要求 Redis 常驻。
3. 启动、健康检查、关闭流程按“实际启用的能力”判断是否需要 Redis。
4. 保持生产默认行为不变，不因抽象削弱现有限流、锁、队列语义。

本方案明确不做的事：

1. 不把 BullMQ、限流、分布式锁全部塞进 `@core/cache`。
2. 不在第一阶段改写业务层 cache key 设计。
3. 不为了本地开发而让生产环境静默降级成内存缓存。

---

## 3. 总体设计

### 3.1 能力拆分

延续队列抽象的思路，Redis 不再被视为“单一基础设施”，而是拆成三个独立能力面：

| 能力面       | 建议模块              | 默认 driver | 本地可选 driver    |
| ------------ | --------------------- | ----------- | ------------------ |
| 缓存         | `core/cache/*`        | `redis`     | `memory`           |
| 速率限制计数 | `core/rate-limit/*`   | `redis`     | `memory` 或 `noop` |
| 协调锁       | `core/coordination/*` | `redis`     | `memory`           |

这条 review 主要落在第一项，但为了兑现“本地开发友好”，启动编排必须同时识别后两项是否仍然要求 Redis。

### 3.2 配置建议

第一阶段新增以下环境变量：

| 变量                | 建议值                        | 默认值  | 用途             |
| ------------------- | ----------------------------- | ------- | ---------------- |
| `CACHE_DRIVER`      | `redis` \| `memory`           | `redis` | 选择缓存实现     |
| `RATE_LIMIT_DRIVER` | `redis` \| `memory` \| `noop` | `redis` | 选择速率限制存储 |
| `LOCK_DRIVER`       | `redis` \| `memory`           | `redis` | 选择协调锁实现   |

说明：

- 生产环境默认仍使用 `redis`，避免无意降级。
- 本地开发推荐组合：`CACHE_DRIVER=memory`、`QUEUE_DRIVER=inline`、`DISABLE_RATE_LIMIT=true` 或 `RATE_LIMIT_DRIVER=noop`、`LOCK_DRIVER=memory`。
- 若后续认为变量过多，可再收敛为运行 profile；第一阶段优先显式、可审计。

### 3.3 目录结构建议

```text
packages/server/src/core/cache/
  index.ts
  types.ts
  driver.ts
  service.ts
  drivers/
    memory/
      memory-cache.driver.ts
    redis/
      redis-cache.driver.ts

packages/server/src/core/rate-limit/
  types.ts
  driver.ts
  drivers/
    memory/
    redis/
    noop/

packages/server/src/core/coordination/
  types.ts
  driver.ts
  drivers/
    memory/
    redis/
```

这里的原则和队列抽象一致：

- 组合根负责按配置选择 driver。
- 业务代码依赖能力接口，不依赖具体 Redis client。
- `public/*` 仅暴露面向调用方的最小能力，不重新长成新的 mega barrel。

---

## 4. 缓存接口建议

### 4.1 Driver 接口

缓存层只抽象纯 KV 能力：

```ts
export interface CacheDriver {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  deleteByPrefix(prefix: string): Promise<number>;
  clear(prefix?: string): Promise<void>;
  getStats?(): Promise<{ size?: number }>;
  ping?(): Promise<void>;
  close?(): Promise<void>;
}
```

设计要点：

- `CacheService` 继续负责 JSON 编解码、namespace 拼接、`getOrSet` 和统计命中率。
- driver 只处理字符串和 TTL，不感知业务对象。
- `ping` / `close` 为可选能力，便于 memory driver 无痛接入生命周期管理。

### 4.2 Service 工厂

建议把今天的 `new CacheService({ namespace, defaultTtl })` 保留为上层 API，但实例化统一走工厂：

```ts
export function createCacheService(options: CacheServiceOptions): CacheService;
export function getCacheDriver(): CacheDriver;
export function closeCacheDriver(): Promise<void>;
export function cacheRequiresRedis(): boolean;
```

这样可以最小化现有调用点改造：

- `cacheService`
- `shortCache`
- `documentIndexCacheService`
- `user.repository`
- `refresh-token.repository`

它们都不需要知道底层是不是 Redis。

### 4.3 Driver 行为约束

`memory` driver 需要满足以下约束：

1. TTL 过期必须懒删除 + 周期清理二选一或组合，不能无限增长。
2. `deleteByPrefix` 语义要与 Redis 版保持一致。
3. 单进程内幂等，不要求跨进程共享。
4. 测试环境必须提供 reset 能力，避免用例串扰。

`redis` driver 只负责替换今天 `@core/redis` 被 `@core/cache` 直接调用的部分，不承载锁和限流逻辑。

---

## 5. 生命周期与健康检查

### 5.1 启动编排

`packages/server/src/index.ts` 不应再无条件调用 `connectRedis()`，而应改为 capability-based bootstrap：

```ts
if (runtimeInfra.requiresRedis()) {
  await connectRedis();
}
```

其中 `requiresRedis()` 由以下条件组合判断：

- `CACHE_DRIVER === 'redis'`
- `QUEUE_DRIVER === 'bullmq'`
- `RATE_LIMIT_DRIVER === 'redis'`
- `LOCK_DRIVER === 'redis'`

### 5.2 Readiness

readiness 不应再固定返回 `database` / `redis` / `qdrant` 三项，而应改为：

1. 始终检查数据库和 Qdrant。
2. 仅在某个启用能力确实依赖 Redis 时，才把 Redis 计入 required checks。
3. 当使用 `memory` / `noop` driver 时，在报告中省略 Redis，或标注为 `not_applicable`。

建议优先采用“省略未启用依赖”的方式，避免把 `not_applicable` 引入共享类型。

### 5.3 Shutdown

`closeRedis()` 同样应只在 `requiresRedis()` 为真时调用；`closeCacheDriver()`、`closeQueueDriver()`、`closeRateLimitDriver()` 各自独立清理。

---

## 6. 分阶段落地

### 阶段 1：缓存抽象落地

范围：

- 新增 `CACHE_DRIVER`
- 引入 `CacheDriver`、`memory` driver、`redis` driver
- `@core/cache` 改为依赖 driver 工厂
- `document-index` / `auth` / `user` 等缓存调用点无感迁移

验收标准：

- `CACHE_DRIVER=memory` 时，纯缓存路径无需 Redis 即可工作
- 现有缓存集成测试在 `redis` driver 下保持通过

### 阶段 2：Redis 语义拆面

范围：

- 为限流引入 `RateLimitStore`
- 为清理锁引入 `CoordinationLockDriver`
- 删除业务代码对 `getRedisClient()` 的直接依赖

验收标准：

- 除基础设施组合根外，业务代码不再直接 import `@core/redis`
- 本地单进程模式可使用 `memory`/`noop` 替代 Redis 原语

### 阶段 3：启动与健康检查按能力编排

范围：

- 启动、readiness、shutdown 改为 capability-based
- `.env.example` 和 `env/schema.ts` 同步补充新变量
- 文档补充本地开发推荐配置

验收标准：

- `CACHE_DRIVER=memory` + `QUEUE_DRIVER=inline` + `RATE_LIMIT_DRIVER=noop` + `LOCK_DRIVER=memory` 时，服务可无 Redis 启动
- 生产默认配置仍然需要 Redis，且行为不变

---

## 7. 测试建议

至少补以下测试：

1. `CacheDriver` 合约测试：`get/set/delete/deleteByPrefix/ttl` 在 `redis`、`memory` 下共用一套断言。
2. 缓存集成测试：`documentIndexCacheService` 的 `getOrSet`、前缀失效、异常降级。
3. 启动测试：memory cache + inline queue + no-op rate limit 场景下不触发 Redis 连接。
4. 健康检查测试：未启用 Redis 依赖时，readiness 不因 Redis 缺席失败。
5. 回归测试：`redis` driver 下 refresh token、用户 auth state、document index cache 行为不变。

---

## 8. 取舍

优点：

- 本地开发不再被 Redis 强绑定。
- 接口边界更清晰，缓存、限流、锁各自演进。
- 与现有队列 driver 抽象风格一致，后续维护成本低。

代价：

- 需要新增 2 到 3 组 driver 组合逻辑，而不是单纯改一个 `CacheService`。
- `memory` driver 只能保证单进程语义，不能替代生产分布式能力。
- 健康检查和启动编排会从“固定依赖”变成“按能力拼装”，实现复杂度会略升。

---

## 9. 推荐结论

建议按“先缓存、再拆 Redis 语义、最后改启动编排”的三阶段推进，而不是一次性做一个笼统的 `RedisAdapter`。

如果只允许做最小可交付版本，优先级建议如下：

1. `CACHE_DRIVER=memory` + `@core/cache` driver 化
2. 启动流程不再无条件 `connectRedis()`
3. `RateLimitStore` / `CoordinationLockDriver` 跟进补齐

这样既能快速解决本地开发被 Redis 阻塞的问题，也不会把非缓存语义继续堆进缓存层。
