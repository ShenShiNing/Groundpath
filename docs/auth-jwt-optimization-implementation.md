# JWT 优化实施记录

## 目标

针对当前认证系统的 6 个问题进行完整优化：

1. refresh 流程对数据库强依赖
2. OAuth state/exchange code 使用内存 Map（多实例不安全）
3. access token 无法即时吊销
4. refresh 重放检测依赖时间窗口（易误判）
5. kid 未用于精确选钥验签
6. cookie SameSite 策略不可配置

## 实施状态

- [x] 阶段 0：建立实施文档与基线
- [x] 阶段 1：OAuth 临时态存储改造（移除内存 Map）
- [x] 阶段 2：refresh 原子消费（替代 5 秒窗口检测）
- [x] 阶段 3：kid 精确验签 + keyring 配置
- [ ] 阶段 4：access token 即时失效机制
- [ ] 阶段 5：cookie 策略配置化
- [ ] 阶段 6：refresh 读路径缓存与降级容错

## 阶段日志

### 阶段 0

- 建立本文件作为统一跟踪文档。
- 后续每完成一个阶段，都会更新状态与变更摘要。

### 阶段 1

- OAuth `state` 从内存 Map 改为签名 token（5 分钟过期，含 `iss/aud` 校验），支持多实例无共享内存运行。
- OAuth `exchange code` 从内存 Map 改为数据库持久化表 `oauth_exchange_codes`，并实现原子单次消费。
- `oauth.controller` 改为异步创建/消费 exchange code。
- 更新配置：新增 `OAUTH_STATE_SECRET`（未配置时回退 `ENCRYPTION_KEY`）。
- 构建验证：`pnpm -F @knowledge-agent/server build` 通过。

### 阶段 2

- `refreshTokenRepository` 新增 `consumeIfValid`，通过单条原子更新实现 refresh token 单次消费（消费即吊销）。
- `tokenService.refreshTokens` 移除 5 秒时间窗重放检测与 `updateLastUsed + revoke` 两步流程，改为消费结果分支处理：
  - `consumed`：继续签发新 token 对
  - `token_mismatch`：安全日志 + 吊销用户全部会话
  - `already_revoked`：阻断并记录重放事件（不再误触发全量吊销）
  - `expired/not_found`：按过期/已撤销处理
- 更新 token service 单测 mock 与断言，匹配原子消费语义。
- 构建验证：`pnpm -F @knowledge-agent/server build` 通过。

### 阶段 3

- 配置层新增 keyring 支持：
  - `JWT_ACCESS_PREVIOUS_KEYS`
  - `JWT_REFRESH_PREVIOUS_KEYS`
  - 格式：`kid:secret,kid:secret`
- `jwt.utils` 新增 `kid` 读取与候选密钥解析逻辑：
  - 若 token header 带 `kid` 且命中当前或历史 key，则仅使用对应 secret 验签。
  - 若缺失或未知 `kid`，回退到当前 secret + 历史 key + 历史 secret 的兼容链路。
- 新增单测覆盖：
  - access token 使用历史 `kid` 验签成功
  - refresh token 使用历史 `kid` 验签成功
- 构建验证：`pnpm -F @knowledge-agent/server build` 通过。
