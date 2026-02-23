# JWT 认证体系一次性整改方案（含删旧代码）

> 目标：在一个改造周期内，完成 JWT 安全加固、旧逻辑删除、性能优化，并满足可灰度上线与可回滚。
> 范围：`packages/server` 为主，含配置、JWT 工具、认证中间件、仓储层、OAuth 交换流程与测试。

---

## 1. 改造目标

1. 保留当前“JWT + 会话可控”的安全模型，不退回纯无状态 JWT。
2. 完成密钥轮换能力（多 `kid` 验签窗口 + JWKS 同步发布）。
3. 移除 refresh token 明文兼容逻辑，仅保留哈希存储与常量时间比对。
4. 降低鉴权热路径开销（避免每次请求都打数据库）。
5. 统一“令牌撤销”语义（单会话撤销、全设备撤销、密码变更撤销）。
6. 删除历史兼容代码，确保长期可维护性。

---

## 2. 当前问题与对应改造

| 问题 | 风险 | 改造动作 |
| --- | --- | --- |
| 单 `kid` 验签，轮换窗口弱 | 切 key 时易导致大量 token 突然失效 | 引入 key ring（current + previous），按 `kid` 选公钥验签 |
| refresh token 明文兼容仍在 | 泄露面增大，查询分支复杂 | 迁移后删除明文 fallback 与相关 SQL `or` 条件 |
| 认证热路径查询较重 | 高并发下性能抖动 | 增强 access auth state/session 缓存与精准失效 |
| 大范围缓存失效策略粗 | 缓存雪崩/命中率下降 | 从 prefix 全删改为按 user/token 索引精确删 |
| 业务用途复用同一 key | 跨用途风险扩大 | 拆分 key purpose（access/refresh/email/oAuth-state） |
| 部分逻辑重复验签 | CPU 冗余 | 去掉刷新后二次 verify 的冗余调用 |

---

## 3. 一次性整改执行顺序

## 阶段 0：基线与分支准备

1. 新建分支：`feat/auth-jwt-hardening`.
2. 冻结认证相关并行开发，避免冲突文件继续漂移。
3. 记录改造前基线：
   - `pnpm -F @knowledge-agent/server test`
   - 记录登录、刷新、登出、OAuth 回调链路的 smoke 结果。

---

## 阶段 1：配置模型升级（支持 key ring）

### 1.1 修改文件

- `packages/server/src/shared/config/env.ts`
- `packages/server/.env.example`

### 1.2 目标设计

1. 从“单 key”升级为“多 key 配置”：
   - `JWT_ACCESS_KEYS`（JSON 或约定格式，含 `kid/private/public/status`）
   - `JWT_REFRESH_KEYS`
2. 明确当前签发 key：
   - `JWT_ACCESS_ACTIVE_KID`
   - `JWT_REFRESH_ACTIVE_KID`
3. 保留 `issuer/audience/algorithm`。

### 1.3 删除旧配置字段（迁移后）

- `JWT_ACCESS_PRIVATE_KEY`
- `JWT_ACCESS_PUBLIC_KEY`
- `JWT_REFRESH_PRIVATE_KEY`
- `JWT_REFRESH_PUBLIC_KEY`
- `JWT_ACCESS_KEY_ID`
- `JWT_REFRESH_KEY_ID`

### 1.4 验收

1. 配置校验必须在启动阶段失败（缺 key、重复 kid、active kid 不存在时）。
2. 旧字段不再被代码引用（`rg` 检查为 0）。

---

## 阶段 2：JWT 工具重构（多 key 验签 + 明确用途）

### 2.1 修改文件

- `packages/server/src/shared/utils/jwt.utils.ts`
- `packages/server/src/modules/auth/jwks/jwks.service.ts`
- `packages/server/src/shared/types/auth.types.ts`（如需补充 claims 类型）

### 2.2 关键改造

1. 验签流程改为：
   - decode header -> 提取 `kid/alg`
   - 校验 `alg` 固定为 `RS256`
   - 通过 `kid` 在 key ring 选 public key
   - `jwt.verify(... issuer/audience/algorithms)`
2. 签发流程改为：
   - 始终使用 active kid 对应 private key 签发
3. JWKS 输出改为：
   - 输出所有 `status=active|previous` 的公钥
   - 每个 key 均含 `kid/use/alg`

### 2.3 用途隔离（最佳实践）

新增独立签发/验签 key ring：

1. access token
2. refresh token
3. email verification token
4. oauth state token

说明：用途隔离后，即使某一用途密钥暴露，不会横向影响其他 token。

---

## 阶段 3：refresh token 存储与验证彻底“哈希化”

### 3.1 修改文件

- `packages/server/src/shared/utils/refresh-token.utils.ts`
- `packages/server/src/modules/auth/repositories/refresh-token.repository.ts`
- `packages/server/src/shared/db/schema/auth/refresh-tokens.schema.ts`（如需列长度调整）
- `packages/server/drizzle/*`（新增迁移）

### 3.2 数据迁移步骤（必须按顺序）

1. 新增迁移脚本：将历史明文 `token` 转为 HMAC-SHA256 值。
2. 验证迁移结果：抽样确认库内不再存在 JWT 样式明文（含 `.` 分隔结构）。
3. 代码切换到“仅哈希”模式。
4. 删除明文兼容逻辑。

### 3.3 必删旧代码

1. `isStoredRefreshTokenMatch` 中的明文直接相等分支（`storedValue === refreshToken`）。
2. `refreshTokenRepository.consumeIfValid` 中 `or(eq(tokenHash), eq(tokenPlain))` 的明文分支。
3. `refreshTokenRepository.findByToken` 的明文查询分支。

---

## 阶段 4：会话/撤销模型优化（性能与语义统一）

### 4.1 修改文件

- `packages/server/src/shared/middleware/auth.middleware.ts`
- `packages/server/src/modules/auth/repositories/refresh-token.repository.ts`
- `packages/server/src/modules/user/repositories/user.repository.ts`
- `packages/server/src/modules/auth/repositories/user-token-state.repository.ts`
- `packages/server/src/modules/auth/services/token.service.ts`
- `packages/server/src/modules/auth/services/auth.service.ts`

### 4.2 优化内容

1. 去冗余：
   - 删除 `auth.service.refresh` 中对新 refresh token 的二次 `verifyRefreshToken`，改为 `tokenService.refreshTokens` 直接返回 `userId`。
2. 热路径减负：
   - `authenticate` 先读 access auth state 缓存，再按需读取 session 缓存。
   - session 有效性采用 tokenId 级缓存，TTL 短（例如 30-60 秒）并精准失效。
3. 失效语义统一：
   - `logout-all`、密码修改、疑似重放攻击触发统一动作：
     - revoke all refresh tokens
     - bump `tokenValidAfter`

### 4.3 必删旧代码

1. 全量前缀删除缓存逻辑（`deleteByPrefix`）在会话撤销处替换为精准删除。
2. 刷新流程中重复 decode/verify 的冗余分支。

---

## 阶段 5：OAuth 与邮箱验证 token 的密钥隔离与最小暴露

### 5.1 修改文件

- `packages/server/src/modules/auth/oauth/oauth.service.ts`
- `packages/server/src/modules/auth/oauth/oauth.controller.ts`
- `packages/server/src/modules/auth/verification/email-verification.service.ts`
- `packages/server/src/shared/utils/oauth-exchange-code.utils.ts`

### 5.2 改造点

1. OAuth state token 改用独立 key purpose。
2. Email verification token 改用独立 key purpose。
3. 保持“refresh token 不进 URL，仅 cookie + 一次性交换码”策略不变。
4. 交换码继续哈希存储与一次消费，维持现有优点。

---

## 阶段 6：测试与质量门禁

### 6.1 必改测试文件

- `packages/server/tests/shared/utils/jwt.utils.test.ts`
- `packages/server/tests/shared/utils/refresh-token.utils.test.ts`
- `packages/server/tests/modules/auth/services/token.service.test.ts`
- `packages/server/tests/modules/auth/jwks/jwks.service.test.ts`
- `packages/server/tests/shared/middleware/security.middleware.test.ts`
- `packages/server/tests/shared/utils/cookie.utils.test.ts`

### 6.2 新增测试用例（重点）

1. key rotation 窗口：
   - 新 key 签发可验签；
   - 旧 key 签发在窗口内可验签，窗口外不可验签。
2. refresh token 哈希-only：
   - 库中明文 token 必然失败；
   - 仅 hash 命中为通过路径。
3. replay 攻击：
   - 第二次使用同一 refresh token 必须 `TOKEN_REVOKED`；
   - mismatch 触发全设备撤销。
4. 会话撤销：
   - logout-all 后旧 access token 立即失效（`tokenValidAfter` 生效）。

### 6.3 门禁命令

1. `pnpm -F @knowledge-agent/server test`
2. `pnpm -F @knowledge-agent/server build`
3. `pnpm lint`

---

## 4. 代码删除清单（最终态必须为 0）

请在改造完成后执行以下检查，结果都应为 0 命中：

1. `rg -n "storedValue === refreshToken" packages/server/src`
2. `rg -n "eq\\(refreshTokens\\.token, token\\)" packages/server/src/modules/auth/repositories/refresh-token.repository.ts`
3. `rg -n "JWT_ACCESS_PRIVATE_KEY|JWT_REFRESH_PRIVATE_KEY|JWT_ACCESS_PUBLIC_KEY|JWT_REFRESH_PUBLIC_KEY|JWT_ACCESS_KEY_ID|JWT_REFRESH_KEY_ID" packages/server/src`
4. `rg -n "deleteByPrefix\\(REFRESH_TOKEN_CACHE_PREFIX\\)" packages/server/src`

---

## 5. 数据库迁移建议

## 迁移 A：refresh token 历史数据哈希化

1. 新增临时脚本，批量扫描 `refresh_tokens.token`。
2. 对非 64 位 hex 的记录，计算 HMAC-SHA256 后回写。
3. 迁移期间保持只读窗口或限流刷新接口，避免并发写冲突。
4. 迁移后立刻切代码到 hash-only。

## 迁移 B：索引优化（可选）

1. 为 `refresh_tokens(user_id, revoked, expires_at)` 保持复合索引。
2. 如有按 `id` 高频查缓存回源，确保主键与二级索引命中计划稳定。

---

## 6. 发布计划（一次性改造但分闸门）

1. 第 1 闸：合并代码但不开启新 active kid（仅兼容运行）。
2. 第 2 闸：开启新 active kid，保持 previous kid 验签窗口（7-14 天）。
3. 第 3 闸：确认无旧 kid token 后，移除 previous kid。
4. 第 4 闸：删除遗留配置与迁移脚本。

---

## 7. 回滚计划

1. 保留上一个稳定发布 tag。
2. 若新 key 配置异常：
   - 回切 active kid 到旧 key；
   - 维持 JWKS 同时发布旧 key。
3. 若哈希迁移异常：
   - 立即禁用 refresh 接口写路径；
   - 恢复数据库快照；
   - 回滚到迁移前版本。

---

## 8. Definition of Done

1. 认证主流程（登录、刷新、登出、登出全部、OAuth、邮箱验证）全部通过自动化测试。
2. refresh token 数据库中不存在明文 token。
3. 代码中无明文 fallback、无旧 env 字段引用、无粗粒度前缀缓存清理。
4. JWKS 可同时暴露 active/previous key，轮换演练通过。
5. 性能回归可接受：
   - 认证接口 P95 不高于改造前 10%。

---

## 9. 建议提交拆分（同一改造周期内）

1. `feat(auth): introduce jwt key ring config and jwks multi-key support`
2. `feat(auth): migrate refresh tokens to hash-only and remove plaintext fallback`
3. `refactor(auth): optimize auth hot path cache and revoke semantics`
4. `refactor(auth): split oauth/email token keys by purpose`
5. `test(auth): add rotation/hash-only/replay/revoke regression coverage`
6. `docs(auth): add jwt hardening remediation runbook`

---

## 10. 执行建议

1. 先在预发全量跑 24 小时真实流量再上生产。
2. 生产首日开启额外安全日志：
   - refresh mismatch
   - replay blocked
   - unknown kid
3. 首周保留 previous key，避免客户端时钟漂移与长尾 token 导致误伤。

