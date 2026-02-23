# 阶段 D 实施记录：会话模型重构（sid）与单设备 access 即时失效

## 1. 目标

- 在 access token 中引入并强制携带 `sid`（session id）
- 将 refresh token 与 `sid` 强绑定（`sid === jti`）
- 鉴权阶段校验 `sid` 对应会话状态，实现单设备 logout 后 access token 立即失效

## 2. 设计取舍

- 复用现有 `refresh_tokens.id` 作为会话主键 `sid`，不新增独立 session 表
- 鉴权会话校验优先复用 `refreshTokenRepository.findValidById`（Redis 热缓存 + DB 回源）
- 保留 `jti` 字段用于兼容既有逻辑，但语义上与 `sid` 绑定一致

## 3. 核心改造

## 3.1 Token 类型与 JWT 结构升级

文件：`packages/server/src/shared/types/auth.types.ts`

- 新增 `AccessTokenSubject`（不含 sid 的用户基础声明）
- `AccessTokenPayload` 增加 `sid`
- `RefreshTokenPayload` 增加 `sid`
- `RefreshTokenContext` 增加 `sid`

文件：`packages/server/src/shared/utils/jwt.utils.ts`

- `verifyAccessToken` 强制校验 `sid` 存在
- `generateRefreshToken(userId, sessionId)` 改为签发 `sid + jti`
- `verifyRefreshToken` 强制校验：
  - `sid` 非空
  - `jti` 非空
  - `sid === jti`

## 3.2 token 签发与轮换改造

文件：`packages/server/src/modules/auth/services/token.service.ts`

- `generateTokenPair` 入参改为 `AccessTokenSubject`
- 每次签发先生成 `sessionId(uuid)`，并同时用于：
  - access token 的 `sid`
  - refresh token 的 `sid/jti`
  - `refresh_tokens.id`
- `refreshTokens` 的原子消费改为基于 `payload.sid` 执行

## 3.3 鉴权中间件增加 sid 会话有效性校验

文件：`packages/server/src/shared/middleware/auth.middleware.ts`

- 新增 `isSessionActiveForUser(sessionId, userId)`
- `authenticate` 在原有用户状态与 `token_valid_after` 校验后，新增 sid 会话校验
- `optionalAuthenticate` 同步增加 sid 会话校验
- `authenticateRefreshToken` 附加 `sid` 到 `req.refreshContext`，并校验 token user 归属一致

## 3.4 会话接口语义对齐 sid

文件：`packages/server/src/modules/auth/controllers/auth.controller.ts`

- `logout` 从 `req.refreshContext.sid` 读取当前会话ID
- `sessions` 接口将 `req.user.sid` 透传给 service，用于正确标记 `isCurrent`

文件：`packages/server/src/modules/auth/services/session.service.ts`

- 参数语义统一为 `sessionId/currentSessionId`

文件：`packages/server/src/modules/auth/services/auth.service.ts`
文件：`packages/server/src/modules/auth/oauth/oauth.service.ts`

- token 签发前 payload 类型改为 `AccessTokenSubject`（sid 由 tokenService 统一注入）

## 4. 受影响文件清单

- `packages/server/src/shared/types/auth.types.ts`
- `packages/server/src/shared/utils/jwt.utils.ts`
- `packages/server/src/shared/middleware/auth.middleware.ts`
- `packages/server/src/modules/auth/services/token.service.ts`
- `packages/server/src/modules/auth/services/session.service.ts`
- `packages/server/src/modules/auth/services/auth.service.ts`
- `packages/server/src/modules/auth/oauth/oauth.service.ts`
- `packages/server/src/modules/auth/controllers/auth.controller.ts`
- `packages/server/tests/shared/utils/jwt.utils.test.ts`
- `packages/server/tests/modules/auth/services/token.service.test.ts`
- `packages/server/tests/modules/auth/services/auth.service.session.test.ts`

## 5. 验证

已执行：

1. `pnpm -F @knowledge-agent/server build`
2. `pnpm -F @knowledge-agent/server test -- tests/shared/utils/jwt.utils.test.ts tests/modules/auth/services/token.service.test.ts`
3. `pnpm -F @knowledge-agent/server test -- tests/modules/auth/services/auth.service.session.test.ts`

结果：

- TypeScript 构建通过
- 阶段 D 相关单元测试通过
